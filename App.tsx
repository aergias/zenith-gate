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
  const [isLockingIn, setIsLockingIn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [matchInput, setMatchInput] = useState("");
  const [discoveryAttempts, setDiscoveryAttempts] = useState(0);
  
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

  const syncUpdateRef = useRef<(type: string, data: any) => void>(() => {});
  const localUsernameRef = useRef(gameState.localUsername);
  const localCharRef = useRef(gameState.localSelectedChar);

  useEffect(() => {
    localUsernameRef.current = gameState.localUsername;
  }, [gameState.localUsername]);

  useEffect(() => {
    localCharRef.current = gameState.localSelectedChar;
  }, [gameState.localSelectedChar]);

  const handleStartGame = useCallback((mode: GameMode, overrideId?: string) => {
    const id = (overrideId || matchInput).trim().toUpperCase();
    if (mode === 'MULTIPLAYER' && !id) return alert("Please enter a Singularity Code.");

    soundService.playUI();
    setDiscoveryAttempts(0);
    
    if (mode === 'MULTIPLAYER') {
      setGameState(prev => ({ 
        ...prev, 
        isConnecting: true, 
        gameMode: 'MULTIPLAYER', 
        matchId: id, 
        phase: 'lobby', 
        isHost: true,
        remoteUsername: undefined,
        remoteReady: false,
        localReady: false
      }));
      if (window.location.hash !== `#matchId=${id}`) {
        window.location.hash = `matchId=${id}`;
      }
    } else {
      syncService.disconnect();
      setGameState(prev => ({ ...prev, gameMode: 'SOLO', matchId: undefined, phase: 'prep', isHost: true }));
    }
  }, [matchInput]);

  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash.includes('matchId=')) {
        const id = hash.split('matchId=')[1].split('&')[0].trim().toUpperCase();
        if (id && id !== gameState.matchId) {
          setMatchInput(id);
          handleStartGame('MULTIPLAYER', id);
        }
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [handleStartGame, gameState.matchId]);

  // Sync Message Processor
  useEffect(() => {
    syncUpdateRef.current = (type: string, data: any) => {
      switch (type) {
        case 'DISCOVERY':
        case 'HANDSHAKE':
          if (!gameState.remoteUsername) {
            setGameState(prev => ({ 
              ...prev, 
              remoteUsername: data.username, 
              isHost: syncService.getClientId() < data.clientId 
            }));
            // Immediate handshake confirmation
            syncService.send('HANDSHAKE', { 
              username: localUsernameRef.current, 
              clientId: syncService.getClientId() 
            });
          }
          break;
        case 'CHAR_SELECT':
          const remoteChar = CHARACTERS.find(c => c.id === data.charId);
          if (remoteChar) setGameState(prev => ({ ...prev, remoteSelectedChar: remoteChar }));
          break;
        case 'READY_STATUS':
          setGameState(prev => ({ ...prev, remoteReady: data.isReady }));
          break;
        case 'START_GAME':
          if (localCharRef.current) initiateBattle(localCharRef.current);
          break;
      }
    };
  });

  // Discovery Loop
  useEffect(() => {
    if (gameState.matchId && (gameState.phase === 'lobby' || gameState.phase === 'prep')) {
      syncService.subscribe(
        gameState.matchId, 
        (type, data) => syncUpdateRef.current(type, data), 
        (status) => setConnStatus(status)
      );

      const interval = window.setInterval(() => {
        if (syncService.getStatus() === 'connected' && !gameState.remoteUsername) {
          setDiscoveryAttempts(prev => prev + 1);
          syncService.send('DISCOVERY', { 
            username: localUsernameRef.current, 
            clientId: syncService.getClientId() 
          });
        }
      }, 750); // Aggressive discovery pulse

      return () => clearInterval(interval);
    }
  }, [gameState.matchId, gameState.phase, gameState.remoteUsername]);

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
    if (isLockingIn) return;
    setIsLockingIn(true);
    const newReady = !gameState.localReady;
    soundService.playVictory();
    
    if (gameState.gameMode === 'MULTIPLAYER') syncService.send('READY_STATUS', { isReady: newReady });
    setGameState(prev => ({ ...prev, localReady: newReady }));

    if (newReady && (gameState.gameMode === 'SOLO' || gameState.remoteReady)) {
      if (gameState.localSelectedChar) initiateBattle(gameState.localSelectedChar);
    } else {
      setTimeout(() => setIsLockingIn(false), 500);
    }
  };

  const initiateBattle = async (playerChar: CharacterTemplate) => {
    setIsWarping(true);
    setIsLockingIn(false);
    soundService.playDash();

    let enemyChar = gameState.remoteSelectedChar || CHARACTERS[0];
    if (gameState.gameMode === 'SOLO') {
      const otherChars = CHARACTERS.filter(c => c.id !== playerChar.id);
      enemyChar = otherChars[Math.floor(Math.random() * otherChars.length)];
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
    setIsLockingIn(false);
    setGameState(prev => ({
      ...prev, player: null, enemy: null, winner: null, phase: 'selection', gameMode: 'SOLO', matchId: undefined, remoteSelectedChar: undefined, remoteUsername: undefined, localReady: false, remoteReady: false, localSelectedChar: undefined, isHost: true, isPaused: false
    }));
    window.location.hash = '';
  }, []);

  const handleRecalibrate = () => {
    soundService.playUI();
    setDiscoveryAttempts(0);
    syncService.connect(true);
  };

  return (
    <div className={`relative w-full h-screen bg-slate-950 overflow-hidden flex flex-col ${isWarping ? 'animate-shake' : ''}`}>
      {/* Warping Overlay */}
      {isWarping && (
        <div className="fixed inset-0 z-[999] pointer-events-none flex items-center justify-center overflow-hidden bg-black/40 backdrop-blur-sm">
          <div className="absolute inset-0 bg-white/10 animate-warp"></div>
          <div className="w-[800px] h-[800px] border-[16px] border-blue-500/20 rounded-full animate-portal blur-xl"></div>
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/30 via-transparent to-purple-600/30"></div>
          <div className="flex flex-col items-center gap-4 z-10">
            <div className="text-white font-black text-6xl italic tracking-tighter uppercase animate-pulse drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">Warping...</div>
            <div className="text-blue-400 font-mono text-[10px] tracking-[1em] uppercase animate-pulse">Synchronizing Multiverse</div>
          </div>
        </div>
      )}

      {gameState.phase === 'selection' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-in w-full max-w-4xl p-6 mx-auto overflow-y-auto">
          <div className="text-center space-y-2 shrink-0">
            <h1 className="text-7xl font-black text-white italic tracking-tighter drop-shadow-2xl uppercase">Zenith Gate</h1>
            <p className="text-blue-400 font-mono text-[10px] tracking-[0.6em] uppercase">Arena of the Infinite</p>
          </div>
          <div className="bg-slate-900/50 p-8 rounded-[32px] border border-slate-700 w-full flex flex-col gap-6 shadow-2xl shrink-0">
            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Identity Trace</label>
               <input 
                type="text" 
                value={gameState.localUsername} 
                onChange={(e) => setGameState(prev => ({ ...prev, localUsername: e.target.value.substring(0, 15) }))} 
                className="w-full bg-slate-950 border border-slate-800 text-white px-6 py-4 rounded-2xl outline-none focus:border-blue-500 font-bold text-lg shadow-inner"
                placeholder="Name your warrior..."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button onClick={() => handleStartGame('SOLO')} className="flex flex-col items-center gap-4 p-8 bg-blue-600/20 border border-blue-500 hover:bg-blue-600/30 rounded-[32px] transition-all group shadow-[0_0_30px_rgba(37,99,235,0.2)]">
                <i className="fa-solid fa-user-shield text-4xl text-blue-400 group-hover:scale-110 transition-transform"></i>
                <div className="flex flex-col items-center">
                  <span className="text-white font-black uppercase tracking-widest text-base">Solo Training</span>
                  <span className="text-blue-400/60 text-[8px] font-bold uppercase mt-1 tracking-widest">Offline Capable</span>
                </div>
              </button>
              <div className="flex flex-col gap-4">
                <div className="flex bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-1 focus-within:border-purple-500 transition-colors shadow-inner">
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
             <div className="text-center w-full">
                <div className="flex items-center gap-3 mb-4 justify-center">
                   <div className="relative">
                    <div className={`w-3 h-3 rounded-full shadow-[0_0_10px] ${connStatus === 'connected' ? 'bg-green-500 shadow-green-500/50' : connStatus === 'error' ? 'bg-red-600 shadow-red-500/50' : 'bg-amber-500 animate-pulse'}`} />
                    {(connStatus === 'connecting' || connStatus === 'disconnected') && <div className="absolute inset-0 w-3 h-3 border-2 border-amber-500 rounded-full animate-ping opacity-75"></div>}
                   </div>
                   <span className={`text-[10px] font-black uppercase tracking-widest ${connStatus === 'connected' ? 'text-green-400' : connStatus === 'error' ? 'text-red-500' : 'text-amber-400'}`}>
                     {connStatus === 'connected' ? 'Gate Synchronized' : connStatus === 'error' ? 'Singularity Link Blocked' : 'Aligning Rift Frequencies...'}
                   </span>
                </div>
                <div className="text-7xl font-black text-white font-mono bg-slate-950 px-10 py-6 rounded-3xl border-2 border-slate-800 tracking-[0.2em] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">{gameState.matchId}</div>
                
                {connStatus === 'connected' && !gameState.remoteUsername && (
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <div className="flex gap-1 h-1 w-32 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 animate-[loading_2s_infinite]" style={{ width: '30%' }}></div>
                    </div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Handshake Pulse (Attempt {discoveryAttempts})</span>
                  </div>
                )}

                <div className="flex gap-4 justify-center mt-8">
                  <button onClick={handleRecalibrate} className="px-6 py-3 bg-slate-800 border border-slate-700 text-white text-[10px] font-black uppercase rounded-xl hover:bg-slate-700 transition-all flex items-center gap-2">
                    <i className="fa-solid fa-rotate-right"></i>
                    {connStatus === 'error' ? 'Force Reset Singularity' : 'Recalibrate Rift'}
                  </button>
                  <button onClick={copyInviteLink} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${copied ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-500'} text-white`}>
                    <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`}></i>
                    {copied ? 'Warp Link Copied' : 'Invite Challenger'}
                  </button>
                </div>
             </div>
             <div className="flex items-center gap-12 w-full justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 bg-blue-600/20 border-2 border-blue-500 rounded-full flex items-center justify-center text-4xl text-blue-400 shadow-lg">
                    <i className="fa-solid fa-user"></i>
                  </div>
                  <span className="text-white font-black uppercase text-sm mt-4 block">{gameState.localUsername}</span>
                </div>
                <div className="text-slate-600 text-3xl animate-pulse">
                  <i className="fa-solid fa-circle-nodes"></i>
                </div>
                <div className="text-center">
                  <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center text-4xl transition-all duration-700 ${gameState.remoteUsername ? 'bg-purple-600/20 border-purple-500 text-purple-400 scale-110 shadow-purple-500/20' : 'bg-slate-800 border-slate-700 text-slate-600 border-dashed animate-pulse'}`}>
                    <i className={`fa-solid ${gameState.remoteUsername ? 'fa-user-check' : 'fa-user-plus'}`}></i>
                  </div>
                  <span className="text-white font-black uppercase text-sm mt-4 block tracking-tighter">{gameState.remoteUsername || 'Seeking Rival...'}</span>
                </div>
             </div>
             {gameState.remoteUsername ? (
               <button onClick={() => setGameState(prev => ({ ...prev, phase: 'prep' }))} className="px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase rounded-2xl shadow-xl transform transition-all hover:scale-105 active:scale-95 italic tracking-tighter">Enter Prep Sector</button>
             ) : (
                <div className="px-12 py-5 bg-slate-800/50 text-slate-500 font-black uppercase text-[10px] tracking-widest rounded-2xl border border-slate-700 animate-pulse italic">Awaiting Synchronized Arrival...</div>
             )}
             <button onClick={handleQuit} className="text-slate-500 hover:text-white font-bold uppercase text-[10px] tracking-widest transition-colors flex items-center gap-2 mt-4">
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
            }} isWarping={isWarping} selectedId={gameState.localSelectedChar?.id} remoteId={gameState.remoteSelectedChar?.id} />
            <div className="flex flex-col gap-6">
              
              {/* Rival Ready Indicator */}
              {gameState.gameMode === 'MULTIPLAYER' && (
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rival Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase ${gameState.remoteReady ? 'text-green-400' : 'text-slate-500'}`}>{gameState.remoteReady ? 'READY' : 'PREPPING'}</span>
                    <div className={`w-3 h-3 rounded-full ${gameState.remoteReady ? 'bg-green-500 animate-pulse' : 'bg-slate-800'}`} style={{ backgroundColor: gameState.remoteReady ? gameState.remoteSelectedChar?.color : undefined }}></div>
                  </div>
                </div>
              )}

              <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl space-y-4">
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Arena Sector</span>
                 <div className="flex flex-col gap-2">
                    {ARENAS.map(a => (
                      <button key={a.id} disabled={!gameState.isHost || isWarping} onClick={() => {
                        if (gameState.gameMode === 'MULTIPLAYER') syncService.send('ARENA_SELECT', { arenaId: a.id });
                        setGameState(prev => ({ ...prev, selectedArenaId: a.id }));
                      }} className={`w-full px-4 py-3 rounded-xl text-left text-xs font-black uppercase border transition-all ${gameState.selectedArenaId === a.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500 disabled:opacity-50'}`}>
                        {a.name}
                      </button>
                    ))}
                 </div>
              </div>

              <button 
                onClick={toggleReady} 
                disabled={!gameState.localSelectedChar || isWarping || isLockingIn} 
                className={`w-full py-6 rounded-3xl font-black uppercase italic text-xl transition-all transform active:scale-95 flex items-center justify-center gap-4 ${isLockingIn ? 'bg-white text-blue-600 scale-95' : gameState.localReady ? 'bg-green-600 shadow-[0_0_30px_rgba(22,163,74,0.6)] animate-pulse' : 'bg-blue-600 hover:bg-blue-500 shadow-xl'} text-white disabled:opacity-50`}
                style={{ backgroundColor: (gameState.localReady && !isLockingIn) ? gameState.localSelectedChar?.color : undefined }}
              >
                {isLockingIn ? (
                   <i className="fa-solid fa-circle-notch animate-spin"></i>
                ) : gameState.localReady ? (
                  <>
                    <i className="fa-solid fa-check-double"></i>
                    <span>WARP READY</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-lock"></i>
                    <span>LOCK IN</span>
                  </>
                )}
              </button>
              <button onClick={handleQuit} disabled={isWarping} className="text-slate-500 hover:text-white font-bold uppercase text-[10px] text-center tracking-widest transition-colors disabled:opacity-20">Sever Singularity Link</button>
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'battle' && gameState.player && gameState.enemy && (
        <div className="h-screen w-full grid grid-rows-[auto_1fr_auto] relative overflow-hidden">
          <HUD player={gameState.player} enemy={gameState.enemy} isPaused={!!gameState.isPaused} tacticalAdvice={gameState.tacticalAdvice} matchId={gameState.matchId} mode="header" localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
          <main className="relative bg-slate-950 overflow-hidden game-canvas-container flex items-center justify-center min-h-0">
             <GameCanvas gameState={gameState} setGameState={setGameState} onGameOver={handleGameOver} />
             {isMenuOpen && (
               <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center gap-8 animate-fade-in p-6">
                 <div className="text-center space-y-2">
                    <h2 className="text-6xl font-black text-white italic tracking-tighter drop-shadow-2xl uppercase">Gate Paused</h2>
                    <p className="text-blue-400 font-mono text-xs uppercase tracking-[0.5em]">Systems on standby</p>
                 </div>
                 <div className="flex flex-col gap-4 w-full max-w-xs">
                   <button onClick={() => { setIsMenuOpen(false); setGameState(prev => ({ ...prev, isPaused: false })); }} className="w-full py-5 bg-blue-600 text-white font-black uppercase rounded-2xl shadow-xl transform transition-transform hover:scale-105 active:scale-95 text-lg italic">Resume Warp</button>
                   <button onClick={handleQuit} className="w-full py-5 bg-slate-800 text-white font-black uppercase rounded-2xl border border-slate-700 hover:bg-slate-700 transition-colors italic">Sever Link</button>
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