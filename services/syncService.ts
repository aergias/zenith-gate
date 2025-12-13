import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_GATE_V6_FINAL';
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
    console.log(`[SyncService] Connection State: ${newStatus}`);
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
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
    }

    this.setStatus('connecting');
    // Using a more reliable demo endpoint with explicit protocol matching
    const relayUrl = `wss://free.piesocket.com/v3/demo?api_key=VCXPI9geS8Z986p8U7vXVtYfFl7uS9v7f9D5Okh1&notify_self=0`;
    
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
            msg.protocol === 'ZENITH_GATE_V6_FINAL' && 
            msg.matchId === this.matchId && 
            msg.senderId !== this.clientId
          ) {
            if (this.onUpdate) this.onUpdate(msg.type, msg.data);
          }
        } catch (e) {
          // Ignore parse errors from other users on the public demo channel
        }
      };

      this.socket.onerror = (err) => {
        console.error('[SyncService] Socket Error', err);
        this.setStatus('error');
      };

      this.socket.onclose = () => {
        if (this.status !== 'disconnected') {
          setTimeout(() => {
            if (this.matchId) this.connect();
          }, 3000);
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
        this.send('PING', { t: Date.now() });
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
      protocol: 'ZENITH_GATE_V6_FINAL'
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[SyncService] Failed to send message:', err);
    }
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