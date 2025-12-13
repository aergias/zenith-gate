import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_GATE_STABLE_V400';
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
  private readonly MAX_ATTEMPTS = 10;

  private setStatus(newStatus: ConnectionStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    console.log(`[SyncService] Rift Signal: ${newStatus.toUpperCase()}`);
    if (this.onStatusChange) {
      setTimeout(() => this.onStatusChange?.(newStatus), 10);
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
    this.connect();
  }

  /**
   * Established a connection to the Rift.
   * @param force Reset retry counters and force a new attempt.
   */
  connect(force: boolean = false) {
    if (this.connectionLock || !this.matchId) return;
    
    // If we're already in error or forced, reset the circuit breaker
    if (force || this.status === 'error') {
      this.reconnectAttempts = 0;
    }

    this.cleanup();
    this.connectionLock = true;
    this.setStatus('connecting');

    // SocketsBay /demo/ is the most reliable free public endpoint
    const relayUrl = `wss://socketsbay.com/wss/v2/1/demo/`;
    
    try {
      this.socket = new WebSocket(relayUrl);

      this.socket.onopen = () => {
        console.log(`[SyncService] Rift Harmonic Established: ${relayUrl}`);
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
            msg.protocol === 'ZENITH_GATE_STABLE_V400' && 
            msg.matchId === this.matchId && 
            msg.senderId !== this.clientId
          ) {
            this.onUpdate?.(msg.type, msg.data);
          }
        } catch (e) {
          // Public channel traffic noise
        }
      };

      this.socket.onerror = () => {
        console.warn(`[SyncService] Rift Distortion detected.`);
        this.connectionLock = false;
      };

      this.socket.onclose = (event) => {
        console.warn(`[SyncService] Rift Collapsed | Code: ${event.code} | Attempt: ${this.reconnectAttempts}`);
        this.connectionLock = false;
        
        if (this.status !== 'disconnected') {
          if (this.reconnectAttempts >= this.MAX_ATTEMPTS) {
            console.error('[SyncService] Max Rift Calibration attempts reached. Circuit broken.');
            this.setStatus('error');
            return;
          }

          // Backoff with randomized jitter to avoid thunderous herd
          const delay = 1000 + (this.reconnectAttempts * 1000) + (Math.random() * 1000);
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
      console.error('[SyncService] Rift Initialization Failed:', err);
      this.connectionLock = false;
      this.setStatus('error');
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send('SYNC_PULSE', { t: Date.now() });
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
      protocol: 'ZENITH_GATE_STABLE_V400'
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
  }

  getClientId() { return this.clientId; }
}

export const syncService = new SyncService();