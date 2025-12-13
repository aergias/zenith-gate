import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, CharacterTemplate, Entity, GameMode, ConnectionStatus } from './types';
import { CHARACTERS, ARENA_WIDTH, ARENA_HEIGHT, ARENAS } from './constants';
import CharacterSelect from './components/CharacterSelect';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import PostMatch from './components/PostMatch';
import { syncService } from './services/syncService';
import { soundService } from './services/soundService';
import { getTacticalAdvice } from './services/geminiService';

const App: React.FC = () => {
  const [isWarping, setIsWarping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detectedSignal, setDetectedSignal] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
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
    localUsername: `Traveler_${Math.floor(Math.random() * 9000) + 1000}`,
    remoteUsername: undefined,
    localReady: false,
    remoteReady: false,
    localSelectedChar: undefined,
    isHost: true 
  });

  const [matchInput, setMatchInput] = useState("");
  const syncUpdateRef = useRef<(type: string, data: any) => void>(() => {});
  const localUsernameRef = useRef(gameState.localUsername);

  useEffect(() => {
    localUsernameRef.current = gameState.localUsername;
  }, [gameState.localUsername]);

  // Handle ESC Key for menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameState.phase === 'battle') {
          setIsMenuOpen(prev => !prev);
          setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }));
          soundService.playUI();
        } else if (gameState.phase === 'lobby' || gameState.phase === 'prep') {
          handleQuit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.phase]);

  // Handle incoming socket messages
  useEffect(() => {
    syncUpdateRef.current = (type: string, data: any) => {
      switch (type) {
        case 'DISCOVERY':
          setGameState(prev => ({ 
            ...prev, 
            remoteUsername: data.username, 
            isHost: syncService.getClientId() < data.clientId 
          }));
          syncService.send('DISCOVERY_REPLY', { 
            username: localUsernameRef.current, 
            clientId: syncService.getClientId() 
          });
          break;
        case 'DISCOVERY_REPLY':
          setGameState(prev => ({ 
            ...prev, 
            remoteUsername: data.username,
            isHost: syncService.getClientId() < data.clientId 
          }));
          break;
        case 'CHAR_SELECT':
          const remoteChar = CHARACTERS.find(c => c.id === data.charId);
          if (remoteChar) setGameState(prev => ({ ...prev, remoteSelectedChar: remoteChar }));
          break;
        case 'READY_STATUS':
          setGameState(prev => ({ ...prev, remoteReady: data.isReady }));
          break;
        case 'START_GAME':
          setGameState(prev => ({ ...prev, phase: 'battle', countdown: 1200 }));
          break;
      }
    };
  }, []);

  // Sync Connection & Active Handshake Loop
  useEffect(() => {
    if (gameState.matchId && (gameState.phase === 'lobby' || gameState.phase === 'prep')) {
      syncService.subscribe(
        gameState.matchId, 
        (type, data) => syncUpdateRef.current(type, data), 
        (status) => setConnStatus(status)
      );

      // Discovery Pulse: Aggressively seek partner until synchronized
      const interval = window.setInterval(() => {
        if (syncService.getStatus() === 'connected' && !gameState.remoteUsername) {
          syncService.send('DISCOVERY', { 
            username: localUsernameRef.current, 
            clientId: syncService.getClientId() 
          });
        }
      }, 1500);

      return () => clearInterval(interval);
    }
  }, [gameState.matchId, gameState.phase, gameState.remoteUsername]);

  const handleStartGame = useCallback((mode: GameMode, overrideId?: string) => {
    const id = (overrideId || matchInput).trim().toUpperCase();
    if (mode === 'MULTIPLAYER' && !id) return alert("Please enter a Singularity Code.");

    soundService.playUI();
    if (mode === 'MULTIPLAYER') {
      setGameState(prev => ({ ...prev, isConnecting: true, gameMode: 'MULTIPLAYER', matchId: id, phase: 'lobby', isHost: true }));
      window.location.hash = `matchId=${id}`;
    } else {
      syncService.disconnect();
      setGameState(prev => ({ ...prev, gameMode: 'SOLO', matchId: undefined, phase: 'prep', isHost: true }));
    }
  }, [matchInput]);

  const generateAndStartHost = useCallback(() => {
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setMatchInput(newId);
    handleStartGame('MULTIPLAYER', newId);
  }, [handleStartGame]);

  const copyInviteLink = () => {
    const id = gameState.matchId || matchInput;
    if (!id) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}#matchId=${id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    soundService.playUI();
  };

  const toggleReady = async () => {
    const newReady = !gameState.localReady;
    soundService.playUI();
    if (gameState.gameMode === 'MULTIPLAYER') syncService.send('READY_STATUS', { isReady: newReady });
    setGameState(prev => ({ ...prev, localReady: newReady }));

    if (newReady && (gameState.gameMode === 'SOLO' || gameState.remoteReady)) {
      if (gameState.localSelectedChar) initiateBattle(gameState.localSelectedChar);
    }
  };

  const initiateBattle = async (playerChar: CharacterTemplate) => {
    setIsWarping(true);
    let enemyChar = gameState.remoteSelectedChar || CHARACTERS[0];
    if (gameState.gameMode === 'SOLO') {
      enemyChar = CHARACTERS.find(c => c.id !== playerChar.id) || CHARACTERS[0];
    }

    const playerEntity: Entity = {
      id: 'player', x: 150, y: ARENA_HEIGHT / 2, targetX: 150, targetY: ARENA_HEIGHT / 2, radius: 25,
      stats: { ...playerChar.stats }, template: JSON.parse(JSON.stringify(playerChar)),
      isPlayer: true, angle: 0, state: 'idle', buffs: [], attackTimer: 0,
    };

    const enemyEntity: Entity = {
      id: 'enemy', x: ARENA_WIDTH - 150, y: ARENA_HEIGHT / 2, targetX: ARENA_WIDTH - 150, targetY: ARENA_HEIGHT / 2, radius: 25,
      stats: { ...enemyChar.stats }, template: JSON.parse(JSON.stringify(enemyChar)),
      isPlayer: false, angle: Math.PI, state: 'idle', buffs: [], attackTimer: 0,
    };

    const advice = await getTacticalAdvice(playerChar, enemyChar);
    if (gameState.gameMode === 'MULTIPLAYER' && gameState.isHost) syncService.send('START_GAME', {});

    setTimeout(() => {
      setIsWarping(false);
      setGameState(prev => ({
        ...prev, player: playerEntity, enemy: enemyEntity, obstacles: ARENAS.find(a => a.id === prev.selectedArenaId)?.obstacles || [],
        phase: 'battle', winner: null, projectiles: [], zones: [], vfx: [],
        countdown: 1200, isPaused: false, tacticalAdvice: advice
      }));
    }, 1500);
  };

  const handleGameOver = useCallback((winner: any) => {
    soundService.playVictory();
    setGameState(prev => ({ ...prev, phase: 'results', winner }));
  }, []);

  const handleQuit = useCallback(() => {
    syncService.disconnect();
    setIsMenuOpen(false);
    setGameState(prev => ({
      ...prev, player: null, enemy: null, winner: null, phase: 'selection', gameMode: 'SOLO', matchId: undefined, remoteSelectedChar: undefined, remoteUsername: undefined, localReady: false, remoteReady: false, localSelectedChar: undefined, isHost: true, isPaused: false
    }));
    window.location.hash = '';
  }, []);

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden flex flex-col">
      {gameState.phase === 'selection' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-in w-full max-w-4xl p-6 mx-auto overflow-y-auto">
          <div className="text-center space-y-2 shrink-0">
            <h1 className="text-7xl font-black text-white italic tracking-tighter drop-shadow-2xl">ZENITH GATE</h1>
            <p className="text-blue-400 font-mono text-[10px] tracking-[0.6em] uppercase">Arena of the Infinite</p>
          </div>
          <div className="bg-slate-900/50 p-8 rounded-[32px] border border-slate-700 w-full flex flex-col gap-6 shadow-2xl shrink-0">
            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Identity Confirmed</label>
               <input 
                type="text" 
                value={gameState.localUsername} 
                onChange={(e) => setGameState(prev => ({ ...prev, localUsername: e.target.value.substring(0, 15) }))} 
                className="w-full bg-slate-950 border border-slate-800 text-white px-6 py-4 rounded-2xl outline-none focus:border-blue-500 font-bold text-lg shadow-inner"
                placeholder="Name your warrior..."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button onClick={() => handleStartGame('SOLO')} className="flex flex-col items-center gap-4 p-8 bg-slate-800/30 border border-slate-700 hover:border-blue-500 rounded-[32px] transition-all group">
                <i className="fa-solid fa-user-shield text-3xl text-blue-400 group-hover:scale-110 transition-transform"></i>
                <span className="text-white font-black uppercase tracking-widest text-sm">Solo Training</span>
              </button>
              <div className="flex flex-col gap-4">
                <div className="flex bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-1 focus-within:border-purple-500 transition-colors">
                  <input type="text" placeholder="Enter Code..." className="bg-transparent text-white px-5 py-3 outline-none flex-1 font-mono text-sm uppercase" value={matchInput} onChange={(e) => setMatchInput(e.target.value)} />
                  <button onClick={() => handleStartGame('MULTIPLAYER')} className="px-6 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase text-[10px] rounded-xl transition-colors">Join</button>
                </div>
                <button onClick={generateAndStartHost} className="w-full py-4 bg-slate-800/50 border border-slate-700 hover:border-purple-500 text-white font-black uppercase text-[10px] rounded-2xl transition-all flex items-center justify-center gap-2">
                  <i className="fa-solid fa-plus-circle"></i>
                  Create Singularity
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 animate-fade-in w-full max-w-4xl p-6 mx-auto">
           <div className="bg-slate-900/50 p-16 rounded-[40px] border border-slate-700 shadow-2xl w-full flex flex-col items-center gap-10">
             <div className="text-center">
                <div className="flex items-center gap-3 mb-4 justify-center">
                   <div className={`w-3 h-3 rounded-full shadow-[0_0_10px] ${connStatus === 'connected' ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50 animate-pulse'}`} />
                   <span className={`text-[10px] font-black uppercase tracking-widest ${connStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
                     {connStatus === 'connected' ? 'Gate Synchronized' : 'Searching for Signal...'}
                   </span>
                </div>
                <div className="text-7xl font-black text-white font-mono bg-slate-950 px-10 py-6 rounded-3xl border-2 border-slate-800 tracking-[0.2em] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">{gameState.matchId}</div>
                <button onClick={copyInviteLink} className={`mt-6 px-8 py-3 rounded-full text-[10px] font-black uppercase transition-all flex items-center gap-2 ${copied ? 'bg-green-600' : 'bg-slate-800 hover:bg-slate-700'} text-white mx-auto`}>
                  <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`}></i>
                  {copied ? 'Link Copied' : 'Copy Warp Link'}
                </button>
             </div>
             <div className="flex items-center gap-12 w-full justify-center">
                <div className="text-center"><div className="w-24 h-24 bg-blue-600/20 border-2 border-blue-500 rounded-full flex items-center justify-center text-4xl text-blue-400 shadow-lg"><i className="fa-solid fa-user"></i></div><span className="text-white font-black uppercase text-sm mt-4 block">{gameState.localUsername}</span></div>
                <div className="text-slate-600 text-3xl animate-pulse"><i className="fa-solid fa-circle-nodes"></i></div>
                <div className="text-center"><div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center text-4xl transition-all duration-700 ${gameState.remoteUsername ? 'bg-purple-600/20 border-purple-500 text-purple-400 scale-110 shadow-purple-500/20' : 'bg-slate-800 border-slate-700 text-slate-600 border-dashed animate-pulse'}`}><i className={`fa-solid ${gameState.remoteUsername ? 'fa-user-check' : 'fa-user-plus'}`}></i></div><span className="text-white font-black uppercase text-sm mt-4 block tracking-tighter">{gameState.remoteUsername || 'Seeking Rival...'}</span></div>
             </div>
             {gameState.remoteUsername ? (
               <button onClick={() => setGameState(prev => ({ ...prev, phase: 'prep' }))} className="px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase rounded-2xl shadow-xl transform transition-all hover:scale-105 active:scale-95 italic tracking-tighter">Initialize Prep Sector</button>
             ) : (
                <div className="px-12 py-5 bg-slate-800/50 text-slate-500 font-black uppercase text-[10px] tracking-widest rounded-2xl border border-slate-700 animate-pulse">Waiting for Connection...</div>
             )}
             <button onClick={handleQuit} className="text-slate-500 hover:text-white font-bold uppercase text-[10px] tracking-widest transition-colors flex items-center gap-2">
               <i className="fa-solid fa-arrow-left"></i>
               Return to Main Gate
             </button>
           </div>
        </div>
      )}

      {gameState.phase === 'prep' && (
        <div className="flex-1 w-full flex flex-col items-center overflow-y-auto p-8 gap-8 animate-fade-in">
          <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">PREP SECTOR</h2>
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
            <CharacterSelect characters={CHARACTERS} onSelect={(c) => { 
              if (gameState.gameMode === 'MULTIPLAYER') syncService.send('CHAR_SELECT', { charId: c.id });
              setGameState(prev => ({ ...prev, localSelectedChar: c }));
            }} isWarping={false} selectedId={gameState.localSelectedChar?.id} remoteId={gameState.remoteSelectedChar?.id} />
            <div className="flex flex-col gap-6">
              <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl space-y-4">
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Arena Sector</span>
                 <div className="flex flex-col gap-2">
                    {ARENAS.map(a => (
                      <button key={a.id} disabled={!gameState.isHost} onClick={() => {
                        if (gameState.gameMode === 'MULTIPLAYER') syncService.send('ARENA_SELECT', { arenaId: a.id });
                        setGameState(prev => ({ ...prev, selectedArenaId: a.id }));
                      }} className={`w-full px-4 py-3 rounded-xl text-left text-xs font-black uppercase border transition-all ${gameState.selectedArenaId === a.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'}`}>
                        {a.name}
                      </button>
                    ))}
                 </div>
              </div>
              <button onClick={toggleReady} disabled={!gameState.localSelectedChar} className={`w-full py-6 rounded-3xl font-black uppercase italic text-xl transition-all transform active:scale-95 ${gameState.localReady ? 'bg-green-600 shadow-[0_0_20px_rgba(22,163,74,0.4)]' : 'bg-blue-600 hover:bg-blue-500 shadow-xl'} text-white`}>
                {gameState.localReady ? 'READY!' : 'LOCK IN'}
              </button>
              <button onClick={handleQuit} className="text-slate-500 hover:text-white font-bold uppercase text-[10px] text-center tracking-widest transition-colors">Sever Singularity Link</button>
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'battle' && gameState.player && gameState.enemy && (
        <div className="h-screen w-full flex flex-col relative overflow-hidden">
          <HUD player={gameState.player} enemy={gameState.enemy} isPaused={!!gameState.isPaused} tacticalAdvice={gameState.tacticalAdvice} matchId={gameState.matchId} mode="header" localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
          
          <main className="flex-1 relative bg-slate-950 overflow-hidden game-canvas-container flex items-center justify-center min-h-0">
             <GameCanvas gameState={gameState} setGameState={setGameState} onGameOver={handleGameOver} />
             
             {isMenuOpen && (
               <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center gap-8 animate-fade-in p-6">
                 <div className="text-center space-y-2">
                    <h2 className="text-6xl font-black text-white italic tracking-tighter drop-shadow-2xl">SINGULARITY HALTED</h2>
                    <p className="text-blue-400 font-mono text-xs uppercase tracking-[0.5em]">Gate systems on standby</p>
                 </div>
                 <div className="flex flex-col gap-4 w-full max-w-xs">
                   <button onClick={() => { setIsMenuOpen(false); setGameState(prev => ({ ...prev, isPaused: false })); }} className="w-full py-5 bg-blue-600 text-white font-black uppercase rounded-2xl shadow-xl transform transition-transform hover:scale-105 active:scale-95 text-lg">Resume Warp</button>
                   <button onClick={handleQuit} className="w-full py-5 bg-slate-800 text-white font-black uppercase rounded-2xl border border-slate-700 hover:bg-slate-700 transition-colors">Sever Connection</button>
                 </div>
               </div>
             )}
          </main>

          <HUD player={gameState.player} enemy={gameState.enemy} isPaused={!!gameState.isPaused} tacticalAdvice={gameState.tacticalAdvice} mode="footer" localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
        </div>
      )}

      {gameState.phase === 'results' && gameState.player && gameState.enemy && (
        <PostMatch winner={gameState.winner!} player={gameState.player} enemy={gameState.enemy} onRestart={handleQuit} localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
      )}
    </div>
  );
};

export default App;