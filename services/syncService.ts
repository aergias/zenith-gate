import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_V10_STABLE'; // Incremented protocol version for fresh handshake
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
  private connectionTimeout: number | null = null;
  private reconnectAttempts: number = 0;
  private connectionLock: boolean = false;

  private setStatus(newStatus: ConnectionStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    console.log(`[SyncService] Rift Signal: ${newStatus.toUpperCase()}`);
    if (this.onStatusChange) {
      // Use requestAnimationFrame to ensure UI updates don't collide with socket events
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

    // If already targeting this match and either open or attempting, don't interrupt
    if (this.socket && 
       (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) && 
       this.matchId === matchId) {
      console.log(`[SyncService] Maintaining existing rift for match: ${matchId}`);
      return;
    }

    console.log(`[SyncService] Calibrating new rift for match: ${matchId}`);
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
    
    this.connectionLock = true;
    this.setStatus('connecting');

    // Public demo relay - broadly accessible
    const relayUrl = `wss://socketsbay.com/wss/v2/1/demo/`;
    
    try {
      this.socket = new WebSocket(relayUrl);

      // Force a timeout if the handshake takes too long (the "stuck in yellow" fix)
      if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
      this.connectionTimeout = window.setTimeout(() => {
        if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
          console.warn("[SyncService] Handshake timeout. Recycling socket.");
          this.socket.close(); // This triggers onclose and subsequent retry
        }
      }, 5000);

      this.socket.onopen = () => {
        if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
        console.log(`[SyncService] Rift Harmonic Established.`);
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.connectionLock = false;
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          const msg: SyncMessage = JSON.parse(event.data);
          if (
            msg && 
            msg.protocol === 'ZENITH_V10_STABLE' && 
            msg.matchId === this.matchId && 
            msg.senderId !== this.clientId
          ) {
            this.onUpdate?.(msg.type, msg.data);
          }
        } catch (e) {
          // Ignore malformed packets from public noise
        }
      };

      this.socket.onerror = (err) => {
        console.warn(`[SyncService] Distortion detected in rift stream.`);
        this.connectionLock = false;
      };

      this.socket.onclose = (event) => {
        if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
        console.warn(`[SyncService] Rift Collapsed | Code: ${event.code} | Attempt: ${this.reconnectAttempts}`);
        this.connectionLock = false;
        this.stopHeartbeat();
        
        if (this.status !== 'disconnected') {
          // Persistent retries with exponential backoff + jitter
          const delay = Math.min(1000 + (this.reconnectAttempts * 1000) + (Math.random() * 1000), 15000);
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
      console.error('[SyncService] Fatal Rift Fault:', err);
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
    }, 10000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private cleanup() {
    this.stopHeartbeat();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
    
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
      protocol: 'ZENITH_V10_STABLE'
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[SyncService] Failed to broadcast packet.');
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