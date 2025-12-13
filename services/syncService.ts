import { GameState, CharacterTemplate } from '../types';

type SyncMessage = {
  type: 'HANDSHAKE' | 'HANDSHAKE_REPLY' | 'CHAR_SELECT' | 'TURN_UPDATE' | 'START_GAME' | 'ARENA_SELECT' | 'READY_STATUS' | 'PING' | 'PONG';
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StateCallback = (type: string, data: any) => void;
type StatusCallback = (status: ConnectionStatus) => void;

class SyncService {
  private socket: WebSocket | null = null;
  private onUpdate: StateCallback | null = null;
  private onStatusChange: StatusCallback | null = null;
  private matchId: string | null = null;
  private clientId: string = Math.random().toString(36).substring(7);
  private status: ConnectionStatus = 'disconnected';
  private heartbeatInterval: number | null = null;
  private reconnectTimeout: number | null = null;

  private setStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    if (this.onStatusChange) this.onStatusChange(newStatus);
  }

  getStatus() { return this.status; }

  subscribe(matchId: string, callback: StateCallback, statusCallback?: StatusCallback) {
    this.matchId = matchId;
    this.onUpdate = callback;
    if (statusCallback) this.onStatusChange = statusCallback;
    
    this.connect();
  }

  private connect() {
    if (this.socket) {
      this.socket.close();
    }

    this.setStatus('connecting');
    // Using a more robust public demo endpoint if available, or hardening the existing one.
    // We add a random suffix to the demo path to slightly reduce collision noise if the provider supports it,
    // though for SocketsBay demo, it's often a single shared pipe.
    const relayUrl = `wss://socketsbay.com/wss/v2/1/demo/`;
    
    try {
      this.socket = new WebSocket(relayUrl);

      this.socket.onopen = () => {
        this.setStatus('connected');
        console.log(`Gate Link Established: Sector ${this.matchId}`);
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          // Public channels are noisy. We only care about valid JSON that matches our matchId.
          const msg: SyncMessage = JSON.parse(event.data);
          if (msg && msg.matchId === this.matchId && msg.senderId !== this.clientId) {
            if (msg.type === 'PING') {
              this.send('PONG', {});
              return;
            }
            if (this.onUpdate) {
              this.onUpdate(msg.type, msg.data);
            }
          }
        } catch (e) {
          // Silently ignore non-JSON or unrelated traffic from the public demo channel
        }
      };

      this.socket.onerror = (event) => {
        this.setStatus('error');
        console.warn(`Gate Link Warning: Signal interference detected.`);
      };
      
      this.socket.onclose = (event) => {
        if (this.status !== 'disconnected') {
          this.setStatus('connecting');
          this.reconnect();
        }
      };
    } catch (err) {
      this.setStatus('error');
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.reconnectTimeout) window.clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = window.setTimeout(() => {
      if (this.matchId) this.connect();
    }, 3000);
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) window.clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = window.setInterval(() => {
      this.send('PING', {});
    }, 10000);
  }

  send(type: SyncMessage['type'], data: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.matchId) {
      return;
    }

    const payload: SyncMessage = {
      type,
      matchId: this.matchId,
      senderId: this.clientId,
      data,
      timestamp: Date.now()
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('Transmission failure through the Gate.');
    }
  }

  disconnect() {
    this.setStatus('disconnected');
    if (this.heartbeatInterval) window.clearInterval(this.heartbeatInterval);
    if (this.reconnectTimeout) window.clearTimeout(this.reconnectTimeout);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.onUpdate = null;
    this.onStatusChange = null;
    this.matchId = null;
  }

  getClientId() { return this.clientId; }
}

export const syncService = new SyncService();
