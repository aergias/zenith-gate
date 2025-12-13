
import { GameState, CharacterTemplate } from '../types';

type SyncMessage = {
  type: 'HANDSHAKE' | 'HANDSHAKE_REPLY' | 'CHAR_SELECT' | 'TURN_UPDATE' | 'START_GAME' | 'ARENA_SELECT' | 'READY_STATUS' | 'PING';
  matchId: string;
  senderId: string;
  data: any;
  timestamp: number;
};

type StateCallback = (type: string, data: any) => void;

class SyncService {
  private socket: WebSocket | null = null;
  private onUpdate: StateCallback | null = null;
  private matchId: string | null = null;
  private clientId: string = Math.random().toString(36).substring(7);

  subscribe(matchId: string, callback: StateCallback) {
    if (this.socket && this.matchId === matchId) return;
    this.disconnect();
    
    this.matchId = matchId;
    this.onUpdate = callback;

    const relayUrl = `wss://socketsbay.com/wss/v2/1/demo/`;
    try {
      this.socket = new WebSocket(relayUrl);

      this.socket.onopen = () => {
        console.log(`Gate Link Established: Sector ${matchId}`);
      };

      this.socket.onmessage = (event) => {
        try {
          const msg: SyncMessage = JSON.parse(event.data);
          if (msg.matchId === this.matchId && msg.senderId !== this.clientId) {
            if (this.onUpdate) {
              this.onUpdate(msg.type, msg.data);
            }
          }
        } catch (e) {
          // demo traffic filter
        }
      };

      this.socket.onerror = (event) => {
        console.warn(`Gate Link Warning: Re-routing signal path...`);
      };
      
      this.socket.onclose = (event) => {
        console.log(`Gate Link Severed.`);
      };
    } catch (err) {
      console.error('CRITICAL: Failed to initialize Gate Link:', err);
    }
  }

  send(type: SyncMessage['type'], data: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.matchId) {
      return;
    }

    const payload: SyncMessage = {
      type,
      matchId: this.matchId,
      senderId: this.clientId,
      data,
      timestamp: Date.now()
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('Transmission failure through the Gate.');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.onUpdate = null;
    this.matchId = null;
  }

  getClientId() { return this.clientId; }
}

export const syncService = new SyncService();