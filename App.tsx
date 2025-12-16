import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, CharacterTemplate, Entity, GameMode, ConnectionStatus, Player, Message, NetworkMessage, AbilityKey } from './types';
import { CHARACTERS, ARENA_WIDTH, ARENA_HEIGHT, ARENAS } from './constants';
import CharacterSelect from './components/CharacterSelect';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import PostMatch from './components/PostMatch';
import LobbyBackground from './components/LobbyBackground';
import ChatWindow from './components/ChatWindow';
import PlayerList from './components/PlayerList';
import { soundService } from './services/soundService';
import { getTacticalAdvice } from './services/geminiService';
import { Peer, DataConnection } from 'peerjs';

const generateRoomId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === 2) result += '-';
  }
  return result;
};

const App: React.FC = () => {
  const [isWarping, setIsWarping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [matchInput, setMatchInput] = useState("");
  
  const [gameState, setGameState] = useState<GameState>({
    player: null,
    enemy: null,
    projectiles: [],
    zones: [],
    vfx: [],
    obstacles: [],
    winner: null,
    phase: 'selection',
    gameMode: 'SOLO',
    currentTurn: 'Player1',
    turnStatus: 'Active',
    selectedArenaId: 'empty',
    countdown: 0,
    isConnecting: false,
    isPaused: false,
    localUsername: `Seeker_${Math.floor(Math.random() * 9000) + 1000}`,
    remoteUsername: undefined,
    localReady: false,
    remoteReady: false,
    localSelectedChar: undefined,
    isHost: true,
    messages: [],
    lobbyPlayers: []
  });

  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const gameStateRef = useRef(gameState);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const localUserRef = useRef<Player>({
    id: `seeker-${Math.random().toString(36).substring(7)}`,
    name: gameState.localUsername,
    role: 'pilot',
    status: 'waiting',
    avatar: `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${gameState.localUsername}`
  });

  useEffect(() => {
    localUserRef.current.name = gameState.localUsername;
    localUserRef.current.avatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${gameState.localUsername}`;
  }, [gameState.localUsername]);

  const setupPeer = (matchId: string, isJoining: boolean) => {
    const hostId = `zenith-gate-${matchId.toLowerCase().trim()}`;
    if (peerRef.current) peerRef.current.destroy();

    const osPlayer: Player = { 
      id: 'zenith-os', 
      name: 'ZENITH OS', 
      role: 'ai-host', 
      status: 'ready', 
      avatar: 'https://images.unsplash.com/photo-1614728263952-84ea256f9679?auto=format&fit=crop&q=80&w=100&h=100' 
    };

    if (!isJoining) {
      const peer = new Peer(hostId);
      peerRef.current = peer;
      peer.on('open', () => {
        setGameState(prev => ({ 
          ...prev, 
          isHost: true,
          lobbyPlayers: [osPlayer, { ...localUserRef.current }]
        }));
        setConnStatus('connected');
        
        peer.on('connection', (conn) => {
          connectionRef.current = conn;
          setupConnection(conn, true);
        });
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          alert("This Singularity Key is already active.");
          setGameState(prev => ({ ...prev, phase: 'selection' }));
        }
      });
    } else {
      const guestPeer = new Peer();
      peerRef.current = guestPeer;
      guestPeer.on('open', () => {
        const conn = guestPeer.connect(hostId);
        connectionRef.current = conn;
        setGameState(prev => ({ 
          ...prev, 
          isHost: false,
          lobbyPlayers: [osPlayer, { ...localUserRef.current }] 
        }));
        setupConnection(conn, false);
      });
      guestPeer.on('error', () => {
        alert("Failed to connect to rift.");
        setGameState(prev => ({ ...prev, phase: 'selection' }));
      });
    }
  };

  const setupConnection = (conn: DataConnection, isHostSide: boolean) => {
    conn.on('open', () => {
      setConnStatus('connected');
      conn.send({ type: 'peer_info', payload: { ...localUserRef.current } });
    });

    conn.on('data', (data: any) => {
      const msg = data as NetworkMessage;
      switch (msg.type) {
        case 'peer_info':
          const peerPlayer = msg.payload;
          setGameState(prev => {
            const otherPlayers = prev.lobbyPlayers.filter(p => p.id !== peerPlayer.id && p.id !== localUserRef.current.id && p.id !== 'zenith-os');
            const os = prev.lobbyPlayers.find(p => p.id === 'zenith-os') || { id: 'zenith-os', name: 'ZENITH OS', role: 'ai-host' as any, status: 'ready' as any, avatar: '' };
            return {
              ...prev,
              remoteUsername: peerPlayer.name,
              lobbyPlayers: [os, { ...localUserRef.current }, peerPlayer, ...otherPlayers]
            };
          });
          if (isHostSide) {
            conn.send({ type: 'peer_info', payload: { ...localUserRef.current } });
          }
          break;

        case 'chat':
          setGameState(prev => ({ ...prev, messages: [...prev.messages, msg.payload] }));
          break;

        case 'player_update':
          const updated = msg.payload;
          setGameState(prev => ({
            ...prev,
            remoteReady: updated.status === 'ready',
            lobbyPlayers: prev.lobbyPlayers.map(p => p.id === updated.id ? updated : p)
          }));
          break;

        case 'phase_change':
          setGameState(prev => ({ ...prev, phase: msg.payload }));
          break;

        case 'char_selected':
          setGameState(prev => ({ ...prev, remoteSelectedChar: msg.payload }));
          break;

        case 'battle_init':
          receiveBattleInit(msg.payload.playerChar, msg.payload.enemyChar, msg.payload.arenaId);
          break;

        case 'battle_sync':
          if (!gameStateRef.current.isHost) {
            setGameState(prev => ({
              ...prev,
              player: msg.payload.entities.find(e => e.id === 'enemy') || prev.player,
              enemy: msg.payload.entities.find(e => e.id === 'player') || prev.enemy,
              projectiles: msg.payload.projectiles,
              zones: msg.payload.zones,
              vfx: [...prev.vfx, ...msg.payload.vfx.filter(v => !prev.vfx.find(pv => pv.id === v.id))],
              countdown: msg.payload.countdown
            }));
          }
          break;

        case 'battle_over':
          setGameState(prev => ({ ...prev, phase: 'results', winner: msg.payload === 'player' ? 'enemy' : 'player' }));
          break;
      }
    });

    conn.on('close', () => {
      setConnStatus('disconnected');
      alert("Peer disconnected.");
      setGameState(prev => ({ ...prev, phase: 'selection', matchId: undefined }));
    });
  };

  const handleStartGame = useCallback((mode: GameMode, action: 'CREATE' | 'JOIN' | 'SOLO') => {
    soundService.playUI();
    if (action === 'SOLO') {
      setGameState(prev => ({ ...prev, gameMode: 'SOLO', phase: 'prep' }));
      return;
    }
    let id = matchInput.trim().toUpperCase();
    if (action === 'CREATE') id = generateRoomId();
    if (action === 'JOIN' && !id) return alert("Enter Singularity Key.");
    setGameState(prev => ({ ...prev, gameMode: 'MULTIPLAYER', matchId: id, phase: 'lobby', isHost: action === 'CREATE' }));
    setupPeer(id, action === 'JOIN');
  }, [matchInput]);

  const handleOpenPrep = () => {
    if (gameState.isHost && connectionRef.current?.open) {
      connectionRef.current.send({ type: 'phase_change', payload: 'prep' });
    }
    setGameState(prev => ({ ...prev, phase: 'prep' }));
  };

  const handleCharSelected = (char: CharacterTemplate) => {
    setGameState(prev => ({ ...prev, localSelectedChar: char }));
    if (connectionRef.current?.open) {
      connectionRef.current.send({ type: 'char_selected', payload: char });
    }
  };

  const handleSendMessage = (text: string) => {
    const msg: Message = { id: `msg-${Date.now()}`, senderId: localUserRef.current.id, senderName: localUserRef.current.name, text, timestamp: Date.now() };
    setGameState(prev => ({ ...prev, messages: [...prev.messages, msg] }));
    if (connectionRef.current?.open) connectionRef.current.send({ type: 'chat', payload: msg });
  };

  const handleAiResponse = (text: string) => {
    const aiMsg: Message = { id: `ai-${Date.now()}`, senderId: 'zenith-os', senderName: 'ZENITH OS', text, timestamp: Date.now(), isAi: true };
    setGameState(prev => ({ ...prev, messages: [...prev.messages, aiMsg] }));
    if (gameState.isHost && connectionRef.current?.open) connectionRef.current.send({ type: 'ai_response', payload: aiMsg });
  };

  const handleLobbyReady = () => {
    const nextStatus = localUserRef.current.status === 'ready' ? 'waiting' : 'ready';
    localUserRef.current.status = nextStatus;
    setGameState(prev => ({
      ...prev,
      localReady: nextStatus === 'ready',
      lobbyPlayers: prev.lobbyPlayers.map(p => p.id === localUserRef.current.id ? { ...localUserRef.current } : p)
    }));
    if (connectionRef.current?.open) connectionRef.current.send({ type: 'player_update', payload: { ...localUserRef.current } });
  };

  const initiateBattle = async (playerChar: CharacterTemplate) => {
    if (!gameState.isHost && gameState.gameMode === 'MULTIPLAYER') return;
    setIsWarping(true);
    let enemyChar = gameState.remoteSelectedChar || CHARACTERS[0];
    
    if (gameState.gameMode === 'MULTIPLAYER' && connectionRef.current?.open) {
      connectionRef.current.send({ 
        type: 'battle_init', 
        payload: { 
          playerChar: enemyChar,
          enemyChar: playerChar, 
          arenaId: gameState.selectedArenaId 
        } 
      });
    }

    if (gameState.gameMode === 'SOLO') {
      const otherChars = CHARACTERS.filter(c => c.id !== playerChar.id);
      enemyChar = otherChars[Math.floor(Math.random() * otherChars.length)];
    }

    const playerEntity: Entity = { id: 'player', x: 150, y: ARENA_HEIGHT / 2, targetX: 150, targetY: ARENA_HEIGHT / 2, radius: 25, stats: { ...playerChar.stats }, template: JSON.parse(JSON.stringify(playerChar)), isPlayer: true, angle: 0, state: 'idle', buffs: [], attackTimer: 0 };
    const enemyEntity: Entity = { id: 'enemy', x: ARENA_WIDTH - 150, y: ARENA_HEIGHT / 2, targetX: ARENA_WIDTH - 150, targetY: ARENA_HEIGHT / 2, radius: 25, stats: { ...enemyChar.stats }, template: JSON.parse(JSON.stringify(enemyChar)), isPlayer: false, angle: Math.PI, state: 'idle', buffs: [], attackTimer: 0 };
    const advice = await getTacticalAdvice(playerChar, enemyChar);
    
    setTimeout(() => {
      setIsWarping(false);
      setGameState(prev => ({ ...prev, player: playerEntity, enemy: enemyEntity, phase: 'battle', countdown: 1200, tacticalAdvice: advice }));
    }, 1500);
  };

  const receiveBattleInit = (playerChar: CharacterTemplate, enemyChar: CharacterTemplate, arenaId: string) => {
    setIsWarping(true);
    const playerEntity: Entity = { id: 'player', x: ARENA_WIDTH - 150, y: ARENA_HEIGHT / 2, targetX: ARENA_WIDTH - 150, targetY: ARENA_HEIGHT / 2, radius: 25, stats: { ...playerChar.stats }, template: JSON.parse(JSON.stringify(playerChar)), isPlayer: true, angle: Math.PI, state: 'idle', buffs: [], attackTimer: 0 };
    const enemyEntity: Entity = { id: 'enemy', x: 150, y: ARENA_HEIGHT / 2, targetX: 150, targetY: ARENA_HEIGHT / 2, radius: 25, stats: { ...enemyChar.stats }, template: JSON.parse(JSON.stringify(enemyChar)), isPlayer: false, angle: 0, state: 'idle', buffs: [], attackTimer: 0 };
    
    setTimeout(() => {
      setIsWarping(false);
      setGameState(prev => ({ ...prev, player: playerEntity, enemy: enemyEntity, phase: 'battle', selectedArenaId: arenaId, countdown: 1200 }));
    }, 1500);
  };

  const goBackToSelection = () => {
    if (peerRef.current) peerRef.current.destroy();
    setGameState(prev => ({ ...prev, phase: 'selection', matchId: undefined, lobbyPlayers: [], messages: [], localReady: false, remoteReady: false, localSelectedChar: undefined, remoteSelectedChar: undefined }));
    soundService.playUI();
  };

  const handleRestart = () => {
    localUserRef.current.status = 'waiting';
    if (gameState.gameMode === 'MULTIPLAYER') {
      if (gameState.isHost && connectionRef.current?.open) {
        connectionRef.current.send({ type: 'phase_change', payload: 'lobby' });
      }
      setGameState(prev => ({ 
        ...prev, 
        phase: 'lobby', 
        player: null, 
        enemy: null, 
        winner: null,
        localReady: false,
        remoteReady: false,
        localSelectedChar: undefined,
        remoteSelectedChar: undefined,
        lobbyPlayers: prev.lobbyPlayers.map(p => p.id === localUserRef.current.id ? { ...localUserRef.current } : p)
      }));
      // If we are guest, we just set our local phase to lobby and wait for sync or for host to also click restart
      // Usually host controls phase change, but it's safe if both can click it
    } else {
      setGameState(prev => ({ 
        ...prev, 
        phase: 'selection', 
        player: null, 
        enemy: null, 
        winner: null,
        localSelectedChar: undefined,
        remoteSelectedChar: undefined 
      }));
    }
  };

  return (
    <div className={`relative w-full h-screen overflow-hidden flex flex-col ${isWarping ? 'animate-shake' : ''}`}>
      <LobbyBackground />
      {isWarping && (
        <div className="fixed inset-0 z-[999] pointer-events-none flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="absolute inset-0 bg-white/10 animate-warp"></div>
          <div className="w-[800px] h-[800px] border-[16px] border-[#d4af37]/20 rounded-full animate-portal blur-xl"></div>
          <div className="flex flex-col items-center gap-4 z-10">
            <div className="text-white font-black text-6xl italic tracking-tighter uppercase animate-pulse drop-shadow-[0_0_20px_rgba(212,175,55,0.5)]">Warping...</div>
          </div>
        </div>
      )}

      {gameState.phase === 'selection' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-in w-full max-w-md p-6 mx-auto overflow-y-auto">
          <div className="text-center mb-8">
            <h1 className="font-cinzel text-6xl font-bold tracking-[0.2em] text-[#d4af37] zenith-glow mb-2 uppercase">Zenith</h1>
            <h2 className="font-orbitron text-xl font-bold tracking-[0.5em] text-white/80 uppercase">Gate</h2>
          </div>
          <div className="glass rounded-[32px] p-8 border border-[#d4af37]/20 w-full flex flex-col gap-6 shadow-2xl shrink-0">
             <div className="space-y-2">
               <label className="block text-[10px] font-orbitron tracking-[0.3em] text-[#d4af37]/60 uppercase mb-3 ml-1">Seeker Identity</label>
               <input type="text" value={gameState.localUsername} onChange={(e) => setGameState(prev => ({ ...prev, localUsername: e.target.value.substring(0, 15) }))} className="w-full bg-black/50 border border-[#d4af37]/20 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-[#d4af37]/60 font-cinzel text-lg tracking-wider" placeholder="Name your seeker..." />
             </div>
             <div className="flex flex-col gap-4">
                <button onClick={() => handleStartGame('SOLO', 'SOLO')} className="w-full bg-white/5 border border-white/10 text-white/80 font-orbitron font-bold tracking-[0.2em] py-4 rounded-xl hover:bg-white/10 transition-all uppercase text-[10px]">Solo Training</button>
                <div className="h-px bg-white/5 my-2" />
                <button onClick={() => handleStartGame('MULTIPLAYER', 'CREATE')} className="w-full bg-[#d4af37]/20 border border-[#d4af37]/30 text-[#d4af37] font-orbitron font-bold tracking-[0.2em] py-5 rounded-xl hover:bg-[#d4af37]/30 transition-all uppercase text-xs shadow-[0_0_15px_rgba(212,175,55,0.1)]">Create Private Rift</button>
                <div className="flex bg-black/40 border border-[#d4af37]/10 rounded-xl overflow-hidden p-1 focus-within:border-[#d4af37]/50 transition-colors">
                  <input type="text" placeholder="Singularity Key..." className="bg-transparent text-white px-5 py-3 outline-none flex-1 font-mono text-sm uppercase" value={matchInput} onChange={(e) => setMatchInput(e.target.value.toUpperCase())} />
                  <button onClick={() => handleStartGame('MULTIPLAYER', 'JOIN')} className="px-6 bg-[#d4af37] text-black font-orbitron font-black uppercase text-[10px] rounded-lg transition-colors">Join</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {gameState.phase === 'lobby' && (
        <div className="flex-1 w-full max-w-7xl mx-auto h-[90vh] flex flex-col md:flex-row gap-8 p-6 animate-fade-in self-center mt-12">
          <div className="w-full md:w-80 flex flex-col gap-6">
            <div className="glass p-8 rounded-[40px] flex-1 flex flex-col zenith-border overflow-hidden relative">
              <button onClick={goBackToSelection} className="absolute top-4 left-4 text-white/20 hover:text-white transition-colors">
                <i className="fa-solid fa-arrow-left"></i>
              </button>
              <PlayerList players={gameState.lobbyPlayers} currentUser={localUserRef.current} />
              <div className="mt-auto pt-8 border-t border-white/5">
                 <button onClick={handleLobbyReady} className={`w-full py-5 rounded-2xl font-orbitron font-bold tracking-[0.2em] text-[10px] transition-all shadow-2xl zenith-border ${gameState.localReady ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40' : 'bg-[#d4af37]/10 text-[#d4af37] hover:bg-[#d4af37]/20'}`}>
                   {gameState.localReady ? 'RESONANCE ALIGNED' : 'ALIGN FREQUENCY'}
                 </button>
              </div>
            </div>
            {gameState.localReady && (gameState.remoteReady || gameState.gameMode === 'SOLO') && gameState.isHost && (
              <button onClick={handleOpenPrep} className="w-full py-6 bg-[#d4af37] text-black font-orbitron font-black uppercase tracking-widest rounded-3xl animate-pulse shadow-[0_0_30px_rgba(212,175,55,0.3)]">Open Prep Sector</button>
            )}
            {gameState.localReady && !gameState.isHost && (
              <div className="w-full py-6 glass rounded-3xl text-center font-orbitron text-[10px] text-[#d4af37]/60 tracking-widest uppercase italic">Awaiting Host Selection...</div>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-6 min-w-0">
             <ChatWindow currentUser={localUserRef.current} messages={gameState.messages} onSendMessage={handleSendMessage} onAiResponse={handleAiResponse} isHost={gameState.isHost} />
             <div className="glass h-24 rounded-[32px] zenith-border flex items-center px-10 justify-between">
                <div className="flex items-center gap-6">
                   <div className="bg-white/5 p-3 rounded-xl border border-white/10"><i className="fa-solid fa-key text-[#d4af37]"></i></div>
                   <div>
                      <p className="text-[9px] text-[#d4af37]/50 font-orbitron tracking-[0.4em] mb-1 uppercase">Singularity Key</p>
                      <div className="flex items-center gap-3">
                        <p className="text-2xl text-white font-mono tracking-widest font-bold">{gameState.matchId}</p>
                        <button onClick={() => { navigator.clipboard.writeText(gameState.matchId || ""); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-[10px] px-3 py-1 rounded bg-white/5 text-white/40">{copied ? 'COPIED' : 'COPY'}</button>
                      </div>
                   </div>
                </div>
                <div className="text-right"><p className="text-[9px] text-[#d4af37]/50 uppercase">Stability</p><p className="text-emerald-400 font-mono text-sm uppercase">{connStatus}</p></div>
             </div>
          </div>
        </div>
      )}

      {gameState.phase === 'prep' && (
        <div className="flex-1 w-full flex flex-col items-center overflow-y-auto p-8 gap-8 animate-fade-in">
          <h2 className="font-cinzel text-4xl font-bold tracking-[0.1em] text-[#d4af37] zenith-glow uppercase">Prep Sector</h2>
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
            <CharacterSelect characters={CHARACTERS} onSelect={handleCharSelected} isWarping={isWarping} selectedId={gameState.localSelectedChar?.id} remoteId={gameState.remoteSelectedChar?.id} />
            <div className="flex flex-col gap-6">
              <div className="glass p-6 rounded-3xl zenith-border space-y-4">
                 <span className="text-[10px] font-orbitron font-black text-[#d4af37]/50 uppercase tracking-widest">Arena Sector</span>
                 <div className="flex flex-col gap-2">
                    {ARENAS.map(a => (
                      <button key={a.id} disabled={!gameState.isHost} onClick={() => setGameState(prev => ({ ...prev, selectedArenaId: a.id }))} className={`w-full px-4 py-3 rounded-xl text-left text-[10px] font-bold uppercase border transition-all ${gameState.selectedArenaId === a.id ? 'bg-[#d4af37] border-[#d4af37] text-black' : 'bg-black/40 border-white/5 text-white/40'}`}>{a.name}</button>
                    ))}
                 </div>
              </div>
              {gameState.isHost ? (
                <button onClick={() => gameState.localSelectedChar && initiateBattle(gameState.localSelectedChar)} disabled={!gameState.localSelectedChar || isWarping} className={`w-full py-6 rounded-3xl font-orbitron font-bold uppercase italic text-xl transition-all bg-[#d4af37] text-black shadow-2xl disabled:opacity-50`}>Warp to Arena</button>
              ) : (
                <div className="w-full py-6 glass rounded-3xl text-center font-orbitron text-[10px] text-[#d4af37]/60 tracking-widest uppercase italic">Awaiting Host Warp...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'battle' && gameState.player && gameState.enemy && (
        <div className="h-screen w-full grid grid-rows-[auto_1fr_auto] relative overflow-hidden bg-slate-950">
          <HUD player={gameState.player} enemy={gameState.enemy} isPaused={!!gameState.isPaused} tacticalAdvice={gameState.tacticalAdvice} matchId={gameState.matchId} mode="header" localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
          <main className="relative game-canvas-container flex items-center justify-center min-h-0">
             <GameCanvas gameState={gameState} setGameState={setGameState} onGameOver={(w) => {
               if (gameState.isHost) {
                 setGameState(prev => ({ ...prev, phase: 'results', winner: w }));
                 if (connectionRef.current?.open) connectionRef.current.send({ type: 'battle_over', payload: w });
               }
             }} connection={connectionRef.current} />
          </main>
          <HUD player={gameState.player} enemy={gameState.enemy} isPaused={!!gameState.isPaused} tacticalAdvice={gameState.tacticalAdvice} mode="footer" localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
        </div>
      )}

      {gameState.phase === 'results' && gameState.player && gameState.enemy && (
        <PostMatch winner={gameState.winner!} player={gameState.player} enemy={gameState.enemy} onRestart={handleRestart} localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
      )}
    </div>
  );
};

export default App;