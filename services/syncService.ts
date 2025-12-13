import { ConnectionStatus } from '../types';

type SyncMessage = {
  type: string;
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
  protocol: 'ZENITH_V200_FINAL';
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

  private setStatus(newStatus: ConnectionStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    console.log(`[SyncService] Link Status: ${newStatus.toUpperCase()}`);
    if (this.onStatusChange) {
      // Use setTimeout to decouple socket events from React render cycles
      setTimeout(() => this.onStatusChange?.(newStatus), 0);
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

  connect() {
    this.cleanup();
    
    if (!this.matchId) return;
    
    this.setStatus('connecting');

    // SocketsBay /demo/ is the most reliable endpoint for free tier public prototyping.
    // Most 'ReadyState 3' errors are caused by invalid paths that the server immediately rejects.
    const relayUrl = `wss://socketsbay.com/wss/v2/1/demo/`;
    
    try {
      this.socket = new WebSocket(relayUrl);

      this.socket.onopen = () => {
        console.log(`[SyncService] Gate Singularity Linked: ${relayUrl}`);
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          // Public demo channel has high noise; we MUST filter strictly
          const msg: SyncMessage = JSON.parse(event.data);
          if (
            msg && 
            msg.protocol === 'ZENITH_V200_FINAL' && 
            msg.matchId === this.matchId && 
            msg.senderId !== this.clientId
          ) {
            this.onUpdate?.(msg.type, msg.data);
          }
        } catch (e) {
          // Silently discard non-JSON or third-party traffic on the shared channel
        }
      };

      this.socket.onerror = (err) => {
        const ws = err.target as WebSocket;
        console.warn(`[SyncService] Transmission Error | State: ${ws?.readyState}`);
        // If we hit ReadyState 3 (CLOSED) or 2 (CLOSING), we need to trigger reconnect
        if (this.status !== 'disconnected') {
          this.setStatus('error');
        }
      };

      this.socket.onclose = (event) => {
        console.warn(`[SyncService] Gate Singularity Closed | Code: ${event.code} | Clean: ${event.wasClean}`);
        
        if (this.status !== 'disconnected') {
          // Reconnection with linear backoff (1s, 2s, 3s... cap at 10s)
          const delay = Math.min(1000 + (this.reconnectAttempts * 1000), 10000);
          this.reconnectAttempts++;
          
          if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = window.setTimeout(() => {
            if (this.matchId) this.connect();
          }, delay);
        }
      };
    } catch (err) {
      console.error('[SyncService] Failed to establish singularity rift:', err);
      this.setStatus('error');
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        // Keep-alive to prevent SocketsBay from dropping idle connections
        this.send('KEEPALIVE', { t: Date.now() });
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
      // Clear listeners to prevent recursion/leaks
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
      protocol: 'ZENITH_V200_FINAL'
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[SyncService] Packet loss during rift burst:', err);
    }
  }

  disconnect() {
    this.setStatus('disconnected');
    this.cleanup();
    this.matchId = null;
  }

  getClientId() { return this.clientId; }
}

export const syncService = new SyncService();