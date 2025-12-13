import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_GATE_V3_FINAL';
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
    console.log(`[Sync] Status: ${newStatus}`);
    if (this.onStatusChange) this.onStatusChange(newStatus);
  }

  getStatus() { return this.status; }

  subscribe(matchId: string, callback: StateCallback, statusCallback?: StatusCallback) {
    this.onUpdate = callback;
    if (statusCallback) this.onStatusChange = statusCallback;

    // If matchId changed, we MUST reconnect
    if (this.matchId !== matchId) {
      this.disconnect();
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      this.matchId = matchId;
      return;
    }

    this.matchId = matchId;
    this.connect();
  }

  connect() {
    if (this.socket) {
      this.socket.close();
    }

    this.setStatus('connecting');
    // Using a more reliable WSS endpoint for production
    const relayUrl = `wss://socketsbay.com/wss/v2/1/demo/`;
    
    try {
      this.socket = new WebSocket(relayUrl);

      this.socket.onopen = () => {
        this.setStatus('connected');
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          const msg: SyncMessage = JSON.parse(event.data);
          if (
            msg && 
            msg.protocol === 'ZENITH_GATE_V3_FINAL' && 
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
          // Public relay is noisy, ignore other traffic
        }
      };

      this.socket.onerror = (err) => {
        console.error('[Sync] Socket Error:', err);
        this.setStatus('error');
      };
      
      this.socket.onclose = () => {
        if (this.status !== 'disconnected') {
          this.reconnect();
        }
      };
    } catch (err) {
      console.error('[Sync] Connection Exception:', err);
      this.setStatus('error');
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.reconnectTimeout) window.clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = window.setTimeout(() => {
      if (this.matchId && this.status !== 'disconnected') {
        this.connect();
      }
    }, 2000); 
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) window.clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send('PING', { t: Date.now() });
      }
    }, 5000);
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
      protocol: 'ZENITH_GATE_V3_FINAL'
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      // Failed to send, status will update on next tick
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
    // Note: Don't clear onUpdate here to maintain React bindings
  }

  getClientId() { return this.clientId; }
}

export const syncService = new SyncService();