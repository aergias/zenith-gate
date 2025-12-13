import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_GATE_V1';
};

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
    if (this.status === newStatus) return;
    this.status = newStatus;
    if (this.onStatusChange) this.onStatusChange(newStatus);
  }

  getStatus() { return this.status; }

  subscribe(matchId: string, callback: StateCallback, statusCallback?: StatusCallback) {
    // If we're already subscribed to this match, just update the callback
    if (this.matchId === matchId && this.socket?.readyState === WebSocket.OPEN) {
      this.onUpdate = callback;
      if (statusCallback) this.onStatusChange = statusCallback;
      return;
    }

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
    // Using the public demo endpoint but with strict message filtering
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
          const msg: SyncMessage = JSON.parse(event.data);
          // Filter out noise from other users on the public demo channel
          if (
            msg && 
            msg.protocol === 'ZENITH_GATE_V1' && 
            msg.matchId === this.matchId && 
            msg.senderId !== this.clientId
          ) {
            if (msg.type === 'PING') {
              this.send('PONG', {});
              return;
            }
            if (this.onUpdate) {
              this.onUpdate(msg.type, msg.data);
            }
          }
        } catch (e) {
          // Ignore invalid JSON or unrelated traffic
        }
      };

      this.socket.onerror = () => {
        this.setStatus('error');
      };
      
      this.socket.onclose = () => {
        if (this.status !== 'disconnected') {
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
      if (this.matchId && this.status !== 'disconnected') this.connect();
    }, 3000);
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) window.clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = window.setInterval(() => {
      this.send('PING', {});
    }, 15000);
  }

  send(type: string, data: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.matchId) {
      return;
    }

    const payload: SyncMessage = {
      type,
      matchId: this.matchId,
      senderId: this.clientId,
      data,
      timestamp: Date.now(),
      protocol: 'ZENITH_GATE_V1'
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