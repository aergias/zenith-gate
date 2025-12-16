import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_V15_FINAL'; // Incremented for isolation
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
  private watchdogInterval: number | null = null;
  private reconnectAttempts: number = 0;
  private isConnecting: boolean = false;
  private retryInProgress: boolean = false;
  private connectionAttemptId: number = 0;

  private setStatus(newStatus: ConnectionStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    console.log(`[SyncService] Rift State: ${newStatus.toUpperCase()}`);
    if (this.onStatusChange) {
      this.onStatusChange(newStatus);
    }
  }

  getStatus() { return this.status; }

  subscribe(matchId: string, callback: StateCallback, statusCallback?: StatusCallback) {
    this.onUpdate = callback;
    if (statusCallback) {
      this.onStatusChange = statusCallback;
      statusCallback(this.status);
    }

    // If target match changes, full reset
    if (this.matchId !== matchId) {
      this.matchId = matchId;
      this.reconnectAttempts = 0;
      this.connect(true);
    } else if (this.status === 'disconnected' || this.status === 'error') {
      this.connect(true);
    }

    this.startWatchdog();
  }

  private startWatchdog() {
    this.stopWatchdog();
    this.watchdogInterval = window.setInterval(() => {
      // If we are stuck in 'connecting' for 4+ seconds, force a fresh rift
      if (this.status === 'connecting' && this.socket?.readyState === WebSocket.CONNECTING) {
        console.warn("[SyncService] Rift Handshake Timeout. Forcing Recalibration...");
        this.connect(true);
      }
    }, 4000);
  }

  private stopWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  connect(force: boolean = false) {
    if (!navigator.onLine) {
      this.setStatus('disconnected');
      return;
    }

    if (force) {
      this.cleanup();
      this.retryInProgress = false;
    }
    
    if (!this.matchId || this.isConnecting) return;

    this.isConnecting = true;
    this.setStatus('connecting');
    this.connectionAttemptId++;
    const currentAttemptId = this.connectionAttemptId;
    
    // Public Relay Endpoint
    const relayUrl = `wss://socketsbay.com/wss/v2/1/demo/`; 

    try {
      this.socket = new WebSocket(relayUrl);

      this.socket.onopen = () => {
        if (this.connectionAttemptId !== currentAttemptId) return;
        this.isConnecting = false;
        this.retryInProgress = false;
        console.log(`[SyncService] Signal Locked. Protocol: ZENITH_V15_FINAL`);
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        if (this.connectionAttemptId !== currentAttemptId) return;
        try {
          const msg: SyncMessage = JSON.parse(event.data);
          if (
            msg && 
            msg.protocol === 'ZENITH_V15_FINAL' && 
            msg.matchId === this.matchId && 
            msg.senderId !== this.clientId
          ) {
            this.onUpdate?.(msg.type, msg.data);
          }
        } catch (e) {
          // Public channel noise from other apps - ignored safely
        }
      };

      this.socket.onclose = (event) => {
        if (this.connectionAttemptId !== currentAttemptId) return;
        this.isConnecting = false;
        if (this.status !== 'disconnected') {
          console.warn(`[SyncService] Signal Lost (Code ${event.code}). Initiating Recovery...`);
          this.handleRetry();
        }
      };

      this.socket.onerror = () => {
        if (this.connectionAttemptId !== currentAttemptId) return;
        this.isConnecting = false;
        // Suppress redundant error logs; handleRetry will manage the state
        this.handleRetry();
      };
    } catch (err) {
      this.isConnecting = false;
      this.retryInProgress = false;
      console.warn('[SyncService] Failed to open rift door:', err);
      this.setStatus('error');
    }
  }

  private handleRetry() {
    if (!this.matchId || this.status === 'disconnected' || this.retryInProgress) return;
    
    this.retryInProgress = true;
    this.stopHeartbeat();
    
    // Exponential backoff with a cap
    const delay = Math.min(1000 + (this.reconnectAttempts * 1500), 10000);
    this.reconnectAttempts++;
    
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = window.setTimeout(() => {
      this.retryInProgress = false;
      if (this.matchId && this.status !== 'disconnected') {
        this.connect();
      }
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send('KEEP_ALIVE', { timestamp: Date.now() });
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  private cleanup() {
    this.stopHeartbeat();
    this.isConnecting = false;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.socket) {
      // Detach listeners before closing to prevent race condition loops
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      try { 
        if (this.socket.readyState !== WebSocket.CLOSED) {
          this.socket.close(); 
        }
      } catch (e) {}
      this.socket = null;
    }
  }

  send(type: string, data: any) {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.matchId) return;

    const payload: SyncMessage = {
      type,
      matchId: this.matchId,
      senderId: this.clientId,
      data,
      timestamp: Date.now(),
      protocol: 'ZENITH_V15_FINAL'
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      // Trace dropped packets silently; retry logic will catch major disconnects
    }
  }

  disconnect() {
    this.setStatus('disconnected');
    this.stopWatchdog();
    this.cleanup();
    this.matchId = null;
    this.reconnectAttempts = 0;
    this.connectionAttemptId++;
    this.retryInProgress = false;
  }

  getClientId() { return this.clientId; }
}

export const syncService = new SyncService();