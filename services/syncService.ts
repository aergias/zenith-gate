import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_GATE_V1_STABLE';
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
  private isAttemptingReconnect: boolean = false;

  private setStatus(newStatus: ConnectionStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    if (this.onStatusChange) this.onStatusChange(newStatus);
  }

  getStatus() { return this.status; }

  subscribe(matchId: string, callback: StateCallback, statusCallback?: StatusCallback) {
    // If we're already subscribed to this match and connected, don't restart
    if (this.matchId === matchId && this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
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
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
    }

    this.setStatus('connecting');
    // Using a more reliable public testing relay
    const relayUrl = `wss://free.piesocket.com/v3/demo?api_key=VCXPI9geS8Z986p8U7vXVtYfFl7uS9v7f9D5Okh1&notify_self=0`;
    
    try {
      this.socket = new WebSocket(relayUrl);

      this.socket.onopen = () => {
        this.setStatus('connected');
        this.isAttemptingReconnect = false;
        console.log(`[Sync] Gate Link Established: Sector ${this.matchId}`);
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          const msg: SyncMessage = JSON.parse(event.data);
          if (
            msg && 
            msg.protocol === 'ZENITH_GATE_V1_STABLE' && 
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
          // Ignore noisy broadcast data
        }
      };

      this.socket.onerror = () => {
        this.setStatus('error');
      };
      
      this.socket.onclose = () => {
        if (this.status !== 'disconnected' && !this.isAttemptingReconnect) {
          this.reconnect();
        }
      };
    } catch (err) {
      this.setStatus('error');
      this.reconnect();
    }
  }

  private reconnect() {
    this.isAttemptingReconnect = true;
    if (this.reconnectTimeout) window.clearTimeout(this.reconnectTimeout);
    
    this.reconnectTimeout = window.setTimeout(() => {
      if (this.matchId && this.status !== 'disconnected') {
        this.connect();
      } else {
        this.isAttemptingReconnect = false;
      }
    }, 5000); // 5s cool-off to prevent flickering
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) window.clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send('PING', { t: Date.now() });
      }
    }, 10000);
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
      protocol: 'ZENITH_GATE_V1_STABLE'
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[Sync] Transmission failure.');
    }
  }

  disconnect() {
    this.setStatus('disconnected');
    this.isAttemptingReconnect = false;
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