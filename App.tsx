import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, CharacterTemplate, Entity, GameMode, ConnectionStatus, Player, Message } from './types';
import { CHARACTERS, ARENA_WIDTH, ARENA_HEIGHT, ARENAS } from './constants';
import CharacterSelect from './components/CharacterSelect';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import PostMatch from './components/PostMatch';
import LobbyBackground from './components/LobbyBackground';
import ChatWindow from './components/ChatWindow';
import PlayerList from './components/PlayerList';
import { syncService } from './services/syncService';
import { soundService } from './services/soundService';
import { getTacticalAdvice } from './services/geminiService';
import { Peer, DataConnection } from 'peerjs';

const App: React.FC = () => {
  const [isWarping, setIsWarping] = useState(false);
  const [isLockingIn, setIsLockingIn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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

  const setupPeer = (matchId: string) => {
    const hostId = `zenith-gate-${matchId.toLowerCase().trim()}`;
    const peer = new Peer(hostId);
    
    peer.on('open', (id) => {
      setGameState(prev => ({ ...prev, isHost: true }));
      peerRef.current = peer;
      setConnStatus('connected');

      // Initialize Zenith OS
      const os: Player = { id: 'zenith-os', name: 'ZENITH OS', role: 'ai-host', status: 'ready', avatar: 'https://images.unsplash.com/photo-1614728263952-84ea256f9679?auto=format&fit=crop&q=80&w=100&h=100' };
      setGameState(prev => ({ 
        ...prev, 
        lobbyPlayers: [os, { ...localUserRef.current }],
        messages: [{ id: 'init', senderId: 'zenith-os', senderName: 'ZENITH OS', text: 'Resonance established. Gate stability at 98.4%. Welcome seeker.', timestamp: Date.now(), isAi: true }]
      }));

      peer.on('connection', (conn) => {
        connectionRef.current = conn;
        setupConnection(conn);
      });
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        const guestPeer = new Peer();
        peerRef.current = guestPeer;
        guestPeer.on('open', () => {
          const conn = guestPeer.connect(hostId);
          connectionRef.current = conn;
          setGameState(prev => ({ ...prev, isHost: false }));
          setupConnection(conn);
        });
      }
    });
  };

  const setupConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      setConnStatus('connected');
      conn.send({ type: 'peer_info', payload: { ...localUserRef.current } });
    });

    conn.on('data', (data: any) => {
      switch (data.type) {
        case 'peer_info':
          const peerPlayer = data.payload as Player;
          setGameState(prev => ({
            ...prev,
            remoteUsername: peerPlayer.name,
            lobbyPlayers: [...prev.lobbyPlayers.filter(p => p.id !== peerPlayer.id), peerPlayer]
          }));
          if (gameState.isHost) conn.send({ type: 'peer_info', payload: { ...localUserRef.current } });
          break;
        case 'chat':
          setGameState(prev => ({ ...prev, messages: [...prev.messages, data.payload] }));
          break;
        case 'player_update':
          const updated = data.payload as Player;
          setGameState(prev => ({
            ...prev,
            remoteReady: updated.status === 'ready',
            lobbyPlayers: prev.lobbyPlayers.map(p => p.id === updated.id ? updated : p)
          }));
          break;
        case 'ai_response':
          setGameState(prev => ({ ...prev, messages: [...prev.messages, data.payload] }));
          break;
      }
    });
  };

  const handleStartGame = useCallback((mode: GameMode, overrideId?: string) => {
    const id = (overrideId || matchInput).trim().toUpperCase();
    if (mode === 'MULTIPLAYER' && !id) return alert("Please enter a Singularity Code.");
    soundService.playUI();
    if (mode === 'MULTIPLAYER') {
      setGameState(prev => ({ ...prev, gameMode: 'MULTIPLAYER', matchId: id, phase: 'lobby' }));
      setupPeer(id);
    } else {
      setGameState(prev => ({ ...prev, gameMode: 'SOLO', phase: 'prep' }));
    }
  }, [matchInput, gameState.localUsername]);

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
    setIsWarping(true);
    let enemyChar = gameState.remoteSelectedChar || CHARACTERS[0];
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
          <form onSubmit={(e) => { e.preventDefault(); handleStartGame('SOLO'); }} className="glass rounded-[32px] p-8 border border-[#d4af37]/20 w-full flex flex-col gap-6 shadow-2xl shrink-0">
             <div className="space-y-2">
               <label className="block text-[10px] font-orbitron tracking-[0.3em] text-[#d4af37]/60 uppercase mb-3 ml-1">Seeker Identity</label>
               <input type="text" value={gameState.localUsername} onChange={(e) => setGameState(prev => ({ ...prev, localUsername: e.target.value.substring(0, 15) }))} className="w-full bg-black/50 border border-[#d4af37]/20 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-[#d4af37]/60 font-cinzel text-lg tracking-wider" placeholder="Name your seeker..." />
             </div>
             <div className="flex flex-col gap-4">
                <button onClick={() => handleStartGame('SOLO')} className="w-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] font-orbitron font-bold tracking-[0.2em] py-5 rounded-xl hover:bg-[#d4af37]/20 transition-all uppercase text-sm">Solo Training</button>
                <div className="flex bg-black/40 border border-[#d4af37]/10 rounded-xl overflow-hidden p-1 focus-within:border-[#d4af37]/50 transition-colors">
                  <input type="text" placeholder="Singularity Key..." className="bg-transparent text-white px-5 py-3 outline-none flex-1 font-mono text-sm uppercase" value={matchInput} onChange={(e) => setMatchInput(e.target.value.toUpperCase())} />
                  <button onClick={() => handleStartGame('MULTIPLAYER')} className="px-6 bg-[#d4af37] text-black font-orbitron font-black uppercase text-[10px] rounded-lg transition-colors">Join</button>
                </div>
             </div>
          </form>
          <p className="mt-8 text-white/30 text-[10px] tracking-widest font-orbitron">RESONANCE PROTOCOL v9.0.4</p>
        </div>
      )}

      {gameState.phase === 'lobby' && (
        <div className="flex-1 w-full max-w-7xl mx-auto h-[90vh] flex flex-col md:flex-row gap-8 p-6 animate-fade-in self-center mt-12">
          <div className="w-full md:w-80 flex flex-col gap-8">
            <div className="glass p-8 rounded-[40px] flex-1 flex flex-col zenith-border overflow-hidden">
              <PlayerList players={gameState.lobbyPlayers} currentUser={localUserRef.current} />
              <div className="mt-auto pt-8 border-t border-white/5">
                 <button onClick={handleLobbyReady} className={`w-full py-5 rounded-2xl font-orbitron font-bold tracking-[0.2em] text-[10px] transition-all shadow-2xl zenith-border ${gameState.localReady ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40' : 'bg-[#d4af37]/10 text-[#d4af37] hover:bg-[#d4af37]/20'}`}>
                   {gameState.localReady ? 'RESONANCE ALIGNED' : 'ALIGN FREQUENCY'}
                 </button>
              </div>
            </div>
            {gameState.localReady && (gameState.remoteReady || gameState.gameMode === 'SOLO') && (
              <button onClick={() => setGameState(prev => ({ ...prev, phase: 'prep' }))} className="w-full py-6 bg-[#d4af37] text-black font-orbitron font-black uppercase tracking-widest rounded-3xl animate-pulse">Open Prep Sector</button>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-8 min-w-0">
             <ChatWindow currentUser={localUserRef.current} messages={gameState.messages} onSendMessage={handleSendMessage} onAiResponse={handleAiResponse} isHost={gameState.isHost} />
             <div className="glass h-20 rounded-3xl zenith-border flex items-center px-10 justify-between">
                <div>
                   <p className="text-[9px] text-[#d4af37]/50 font-orbitron tracking-widest mb-1 uppercase">Sanctum</p>
                   <p className="text-xs text-white/90 font-mono tracking-wider">{gameState.matchId}</p>
                </div>
                <div className="text-right">
                   <p className="text-[9px] text-[#d4af37]/50 font-orbitron tracking-widest mb-1 uppercase">Link status</p>
                   <p className={`text-xs font-mono tracking-wider ${connStatus === 'connected' ? 'text-emerald-400' : 'text-amber-500'}`}>{connStatus.toUpperCase()}</p>
                </div>
             </div>
          </div>
        </div>
      )}

      {gameState.phase === 'prep' && (
        <div className="flex-1 w-full flex flex-col items-center overflow-y-auto p-8 gap-8 animate-fade-in">
          <h2 className="font-cinzel text-4xl font-bold tracking-[0.1em] text-[#d4af37] zenith-glow uppercase">Prep Sector</h2>
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
            <CharacterSelect characters={CHARACTERS} onSelect={(c) => setGameState(prev => ({ ...prev, localSelectedChar: c }))} isWarping={isWarping} selectedId={gameState.localSelectedChar?.id} remoteId={gameState.remoteSelectedChar?.id} />
            <div className="flex flex-col gap-6">
              <div className="glass p-6 rounded-3xl zenith-border space-y-4">
                 <span className="text-[10px] font-orbitron font-black text-[#d4af37]/50 uppercase tracking-widest">Arena Sector</span>
                 <div className="flex flex-col gap-2">
                    {ARENAS.map(a => (
                      <button key={a.id} onClick={() => setGameState(prev => ({ ...prev, selectedArenaId: a.id }))} className={`w-full px-4 py-3 rounded-xl text-left text-[10px] font-bold uppercase border transition-all ${gameState.selectedArenaId === a.id ? 'bg-[#d4af37] border-[#d4af37] text-black' : 'bg-black/40 border-white/5 text-white/40 hover:border-[#d4af37]/30'}`}>{a.name}</button>
                    ))}
                 </div>
              </div>
              <button onClick={() => gameState.localSelectedChar && initiateBattle(gameState.localSelectedChar)} disabled={!gameState.localSelectedChar || isWarping} className={`w-full py-6 rounded-3xl font-orbitron font-bold uppercase italic text-xl transition-all transform active:scale-95 bg-[#d4af37] text-black shadow-2xl disabled:opacity-20`}>Warp to Arena</button>
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'battle' && gameState.player && gameState.enemy && (
        <div className="h-screen w-full grid grid-rows-[auto_1fr_auto] relative overflow-hidden bg-slate-950">
          <HUD player={gameState.player} enemy={gameState.enemy} isPaused={!!gameState.isPaused} tacticalAdvice={gameState.tacticalAdvice} matchId={gameState.matchId} mode="header" localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
          <main className="relative game-canvas-container flex items-center justify-center min-h-0">
             <GameCanvas gameState={gameState} setGameState={setGameState} onGameOver={(w) => setGameState(prev => ({ ...prev, phase: 'results', winner: w }))} />
          </main>
          <HUD player={gameState.player} enemy={gameState.enemy} isPaused={!!gameState.isPaused} tacticalAdvice={gameState.tacticalAdvice} mode="footer" localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
        </div>
      )}

      {gameState.phase === 'results' && gameState.player && gameState.enemy && (
        <PostMatch winner={gameState.winner!} player={gameState.player} enemy={gameState.enemy} onRestart={() => setGameState(prev => ({ ...prev, phase: 'selection', player: null, enemy: null }))} localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
      )}
    </div>
  );
};

export default App;