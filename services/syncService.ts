import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_GATE_STABLE_V5';
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

  private setStatus(newStatus: ConnectionStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    console.log(`[SyncService] Link: ${newStatus}`);
    if (this.onStatusChange) this.onStatusChange(newStatus);
  }

  getStatus() { return this.status; }

  subscribe(matchId: string, callback: StateCallback, statusCallback?: StatusCallback) {
    this.onUpdate = callback;
    if (statusCallback) {
      this.onStatusChange = statusCallback;
      statusCallback(this.status);
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.matchId === matchId) {
      this.setStatus('connected');
      return;
    }

    this.matchId = matchId;
    this.connect();
  }

  connect() {
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }

    this.setStatus('connecting');
    // Using a reliable public relay with a specific app prefix
    const relayUrl = `wss://socketsbay.com/wss/v2/1/zenith_gate_relay/`;
    
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
            msg.protocol === 'ZENITH_GATE_STABLE_V5' && 
            msg.matchId === this.matchId && 
            msg.senderId !== this.clientId
          ) {
            if (this.onUpdate) this.onUpdate(msg.type, msg.data);
          }
        } catch (e) {}
      };

      this.socket.onerror = () => this.setStatus('error');
      this.socket.onclose = () => {
        if (this.status !== 'disconnected') {
          setTimeout(() => this.connect(), 2000);
        }
      };
    } catch (err) {
      this.setStatus('error');
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) window.clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send('HEARTBEAT', { t: Date.now() });
      }
    }, 10000);
  }

  send(type: string, data: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.matchId) return;

    const payload: SyncMessage = {
      type,
      matchId: this.matchId,
      senderId: this.clientId,
      data,
      timestamp: Date.now(),
      protocol: 'ZENITH_GATE_STABLE_V5'
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {}
  }

  disconnect() {
    this.setStatus('disconnected');
    if (this.heartbeatInterval) window.clearInterval(this.heartbeatInterval);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.matchId = null;
  }

  getClientId() { return this.clientId; }
}

export const syncService = new SyncService();