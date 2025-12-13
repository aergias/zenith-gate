import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_V7_STABLE';
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
  private reconnectAttempts: number = 0;
  private connectionLock: boolean = false;
  private readonly MAX_ATTEMPTS = 20; // Increased for higher stability

  private setStatus(newStatus: ConnectionStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    console.log(`[SyncService] Rift Signal: ${newStatus.toUpperCase()}`);
    if (this.onStatusChange) {
      // Use requestAnimationFrame to ensure we don't block the UI thread during status flips
      requestAnimationFrame(() => this.onStatusChange?.(newStatus));
    }
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
    this.reconnectAttempts = 0;
    this.connect(true);
  }

  connect(force: boolean = false) {
    if (force) {
      this.cleanup();
      this.reconnectAttempts = 0;
      this.connectionLock = false;
    }

    if (this.connectionLock || !this.matchId) return;
    
    this.cleanup();
    this.connectionLock = true;
    this.setStatus('connecting');

    // Using SocketsBay demo channel - ensures maximum availability
    const relayUrl = `wss://socketsbay.com/wss/v2/1/demo/`;
    
    try {
      this.socket = new WebSocket(relayUrl);

      this.socket.onopen = () => {
        console.log(`[SyncService] Rift Harmonic Established.`);
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.connectionLock = false;
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          const msg: SyncMessage = JSON.parse(event.data);
          // Strict protocol filtering to ignore noise on the demo channel
          if (
            msg && 
            msg.protocol === 'ZENITH_V7_STABLE' && 
            msg.matchId === this.matchId && 
            msg.senderId !== this.clientId
          ) {
            this.onUpdate?.(msg.type, msg.data);
          }
        } catch (e) {
          // Public relay noise is expected
        }
      };

      this.socket.onerror = (err) => {
        console.warn(`[SyncService] Rift Distortion detected.`);
        this.connectionLock = false;
      };

      this.socket.onclose = (event) => {
        console.warn(`[SyncService] Rift Collapsed | Code: ${event.code} | Attempt: ${this.reconnectAttempts}`);
        this.connectionLock = false;
        this.stopHeartbeat();
        
        if (this.status !== 'disconnected') {
          if (this.reconnectAttempts >= this.MAX_ATTEMPTS) {
            console.error('[SyncService] Max Rift Calibration attempts reached. Circuit broken.');
            this.setStatus('error');
            return;
          }

          // Jittered linear backoff for fairer reconnection
          const delay = 1000 + (this.reconnectAttempts * 1000) + (Math.random() * 500);
          this.reconnectAttempts++;
          
          if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = window.setTimeout(() => {
            if (this.matchId && this.status !== 'disconnected') {
              this.connect();
            }
          }, delay);
        }
      };
    } catch (err) {
      console.error('[SyncService] Rift Fault:', err);
      this.connectionLock = false;
      this.setStatus('error');
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send('HEARTBEAT', { t: Date.now() });
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private cleanup() {
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try {
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close();
        }
      } catch (e) {}
      this.socket = null;
    }
  }

  send(type: string, data: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.matchId) return;

    const payload: SyncMessage = {
      type,
      matchId: this.matchId,
      senderId: this.clientId,
      data,
      timestamp: Date.now(),
      protocol: 'ZENITH_V7_STABLE'
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[SyncService] Packet loss in Rift stream.');
    }
  }

  disconnect() {
    this.setStatus('disconnected');
    this.cleanup();
    this.matchId = null;
    this.connectionLock = false;
    this.reconnectAttempts = 0;
  }

  getClientId() { return this.clientId; }
}

export const syncService = new SyncService();