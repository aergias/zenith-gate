import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, CharacterTemplate, Entity, GameMode, ConnectionStatus } from './types';
import { CHARACTERS, ARENA_WIDTH, ARENA_HEIGHT, ARENAS } from './constants';
import CharacterSelect from './components/CharacterSelect';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import PostMatch from './components/PostMatch';
import { syncService } from './services/syncService';
import { soundService } from './services/soundService';
import { getTacticalAdvice, getPostMatchCommentary } from './services/geminiService';

const App: React.FC = () => {
  const [isWarping, setIsWarping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [detectedSignal, setDetectedSignal] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  
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
  
  // Persistent reference for handling sync updates without stale closures
  const syncUpdateRef = useRef<(type: string, data: any) => void>(() => {});
  const localUsernameRef = useRef(gameState.localUsername);

  useEffect(() => {
    localUsernameRef.current = gameState.localUsername;
  }, [gameState.localUsername]);

  // Handle incoming messages from the sync service
  useEffect(() => {
    syncUpdateRef.current = (type: string, data: any) => {
      switch (type) {
        case 'HANDSHAKE':
          setGameState(prev => {
            const isMaster = syncService.getClientId() < data.clientId;
            return { 
              ...prev, 
              remoteUsername: data.username,
              isHost: isMaster
            };
          });
          // Immediately reply to confirm we are here
          syncService.send('HANDSHAKE_REPLY', { 
            username: localUsernameRef.current, 
            clientId: syncService.getClientId() 
          });
          break;
        case 'HANDSHAKE_REPLY':
          setGameState(prev => ({ 
            ...prev, 
            remoteUsername: data.username,
            isHost: syncService.getClientId() < data.clientId 
          }));
          break;
        case 'ARENA_SELECT':
          setGameState(prev => ({ ...prev, selectedArenaId: data.arenaId }));
          break;
        case 'CHAR_SELECT':
          const remoteChar = CHARACTERS.find(c => c.id === data.charId);
          if (remoteChar) {
            setGameState(prev => ({ ...prev, remoteSelectedChar: remoteChar }));
          }
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

  // Manage Global Connection Subscription
  useEffect(() => {
    if (gameState.matchId && (gameState.phase === 'lobby' || gameState.phase === 'prep')) {
      syncService.subscribe(
        gameState.matchId, 
        (type, data) => syncUpdateRef.current(type, data), 
        (status) => setConnStatus(status)
      );

      // Start the handshake loop
      const interval = window.setInterval(() => {
        if (syncService.getStatus() === 'connected' && !gameState.remoteUsername) {
          syncService.send('HANDSHAKE', { 
            username: localUsernameRef.current, 
            clientId: syncService.getClientId() 
          });
        }
      }, 2000);

      return () => {
        clearInterval(interval);
      };
    }
  }, [gameState.matchId, gameState.phase, gameState.remoteUsername]);

  // Global Escape Key Listener for Pausing
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gameState.phase === 'battle') {
        setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }));
        soundService.playUI();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [gameState.phase]);

  const handleStartGame = useCallback((mode: GameMode, overrideId?: string) => {
    const id = (overrideId || matchInput).trim().toUpperCase();
    if (mode === 'MULTIPLAYER' && !id) {
      alert("A Singularity Code is required to warp.");
      return;
    }

    soundService.playUI();
    
    if (mode === 'MULTIPLAYER') {
      setGameState(prev => ({ 
        ...prev, 
        isConnecting: true, 
        gameMode: 'MULTIPLAYER', 
        matchId: id,
        phase: 'lobby',
        isHost: true 
      }));
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

  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const matchIdFromUrl = params.get('matchId');
      
      if (matchIdFromUrl && gameState.phase === 'selection') {
        setMatchInput(matchIdFromUrl);
        setDetectedSignal(matchIdFromUrl);
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [gameState.phase]);

  const getBasePortalUrl = () => {
    return window.location.origin + window.location.pathname;
  };

  const copyPortalUrl = () => {
    navigator.clipboard.writeText(getBasePortalUrl());
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
    soundService.playUI();
  };

  const copyInviteLink = () => {
    const id = gameState.matchId || matchInput;
    if (!id) return;
    const shareUrl = `${getBasePortalUrl()}#matchId=${id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    soundService.playUI();
  };

  const handleCharacterSelect = useCallback(async (playerChar: CharacterTemplate) => {
    if (gameState.gameMode === 'MULTIPLAYER') {
      syncService.send('CHAR_SELECT', { charId: playerChar.id });
    }
    setGameState(prev => ({ ...prev, localSelectedChar: playerChar }));
  }, [gameState.gameMode]);

  const handleArenaSelect = (arenaId: string) => {
    if (!gameState.isHost) return; 
    if (gameState.gameMode === 'MULTIPLAYER') {
      syncService.send('ARENA_SELECT', { arenaId });
    }
    setGameState(prev => ({ ...prev, selectedArenaId: arenaId }));
    soundService.playUI();
  };

  const toggleReady = async () => {
    const newReady = !gameState.localReady;
    soundService.playUI();
    
    if (gameState.gameMode === 'MULTIPLAYER') {
      syncService.send('READY_STATUS', { isReady: newReady });
    }

    setGameState(prev => ({ ...prev, localReady: newReady }));

    if (newReady && (gameState.gameMode === 'SOLO' || gameState.remoteReady)) {
      if (gameState.localSelectedChar) {
        initiateBattle(gameState.localSelectedChar);
      }
    }
  };

  const initiateBattle = async (playerChar: CharacterTemplate) => {
    setIsWarping(true);
    let enemyChar: CharacterTemplate = gameState.remoteSelectedChar || CHARACTERS[0];
    
    if (gameState.gameMode === 'SOLO') {
      let candidate: CharacterTemplate;
      do { candidate = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]; } while (candidate.id === playerChar.id && CHARACTERS.length > 1);
      enemyChar = candidate;
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
    const selectedLayout = ARENAS.find(a => a.id === gameState.selectedArenaId) || ARENAS[0];

    if (gameState.gameMode === 'MULTIPLAYER' && gameState.isHost) {
      syncService.send('START_GAME', {});
    }

    setTimeout(() => {
      setIsWarping(false);
      setGameState(prev => ({
        ...prev, player: playerEntity, enemy: enemyEntity, obstacles: selectedLayout.obstacles,
        phase: 'battle', winner: null, projectiles: [], zones: [], vfx: [],
        countdown: 1200, isPaused: false, tacticalAdvice: advice
      }));
    }, 1500);
  };

  const handleGameOver = useCallback(async (winner: 'player' | 'enemy' | 'Player1' | 'Player2') => {
    soundService.playVictory();
    const isPlayerWinner = winner === 'player' || winner === 'Player1';
    
    setGameState(prev => ({ ...prev, phase: 'results', winner }));

    if (gameState.player && gameState.enemy) {
      const winnerName = isPlayerWinner ? gameState.localUsername : (gameState.remoteUsername || gameState.enemy.template.name);
      const loserName = isPlayerWinner ? (gameState.remoteUsername || gameState.enemy.template.name) : gameState.localUsername;
      
      try {
        const commentary = await getPostMatchCommentary(winnerName, loserName, isPlayerWinner);
        setGameState(prev => ({ ...prev, tacticalAdvice: commentary }));
      } catch (error) {
        console.error("Failed to fetch post-match commentary:", error);
      }
    }
  }, [gameState.localUsername, gameState.remoteUsername, gameState.player, gameState.enemy]);

  const handleQuit = useCallback(() => {
    syncService.disconnect();
    setGameState(prev => ({
      ...prev, player: null, enemy: null, winner: null, phase: 'selection', gameMode: 'SOLO', matchId: undefined, remoteSelectedChar: undefined, remoteUsername: undefined, localReady: false, remoteReady: false, localSelectedChar: undefined, isHost: true
    }));
    window.location.hash = '';
    setDetectedSignal(null);
    setConnStatus('disconnected');
  }, []);

  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' || 
                      window.location.hostname.includes('stackblitz');

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden flex flex-col items-center">
      {gameState.phase === 'selection' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-in w-full max-w-4xl p-6">
          <div className="text-center space-y-2">
            <h1 className="text-7xl font-black text-white tracking-tighter uppercase italic text-center drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              ZENITH <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">GATE</span>
            </h1>
            <p className="text-blue-400 font-mono text-[10px] uppercase tracking-[0.6em]">Arena of the Infinite</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-[32px] border border-slate-700 w-full flex flex-col gap-6 shadow-2xl relative">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Identity Confirmation</label>
              <input 
                type="text" 
                value={gameState.localUsername} 
                onChange={(e) => setGameState(prev => ({ ...prev, localUsername: e.target.value.substring(0, 15) }))} 
                className="w-full bg-slate-950 border border-slate-800 text-white px-6 py-4 rounded-2xl outline-none focus:border-blue-500 transition-colors font-bold text-lg shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]"
                placeholder="Name your warrior..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button onClick={() => handleStartGame('SOLO')} className="group flex flex-col items-center gap-4 p-8 bg-slate-800/30 border border-slate-700 hover:border-blue-500 rounded-[32px] transition-all hover:bg-slate-800/50">
                <div className="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center border border-blue-500/20 group-hover:scale-110 transition-transform">
                  <i className="fa-solid fa-user-shield text-3xl text-blue-400"></i>
                </div>
                <div className="text-center">
                  <span className="text-white font-black uppercase tracking-widest text-sm">Solo Training</span>
                  <p className="text-slate-500 text-[9px] font-bold uppercase mt-1">Fight the AI</p>
                </div>
              </button>
              
              <div className="flex flex-col gap-4">
                <div className={`flex bg-slate-950 border rounded-2xl overflow-hidden transition-all ring-4 ring-transparent p-1 ${detectedSignal ? 'border-purple-500 ring-purple-500/10' : 'border-slate-800 focus-within:border-purple-500 focus-within:ring-purple-500/10'}`}>
                  <input 
                    type="text" 
                    placeholder="Enter Code..." 
                    className="bg-transparent text-white px-5 py-3 outline-none flex-1 font-mono text-sm uppercase placeholder:text-slate-700 tracking-[0.2em]" 
                    value={matchInput} 
                    onChange={(e) => { setMatchInput(e.target.value); setDetectedSignal(null); }} 
                    onKeyDown={(e) => e.key === 'Enter' && handleStartGame('MULTIPLAYER')}
                  />
                  <button onClick={() => handleStartGame('MULTIPLAYER')} className={`px-6 font-black uppercase text-[10px] tracking-widest transition-all rounded-xl ${detectedSignal ? 'bg-purple-500 text-white animate-pulse shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
                    {detectedSignal ? 'Warp to Friend' : 'Join'}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                   <div className="h-[1px] bg-slate-800 flex-1"></div>
                   <span className="text-slate-700 text-[8px] font-black uppercase">Host New</span>
                   <div className="h-[1px] bg-slate-800 flex-1"></div>
                </div>
                <button onClick={generateAndStartHost} className="w-full py-4 bg-slate-800/50 border border-slate-700 hover:border-purple-500 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all flex items-center justify-center gap-3 group">
                  <i className="fa-solid fa-plus-circle group-hover:rotate-90 transition-transform"></i>
                  Create Singularity
                </button>
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-6 flex flex-col gap-4">
               <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Warp Access Protocols</span>
                  {isLocalhost && <span className="text-[8px] text-amber-500 font-black uppercase flex items-center gap-1"><i className="fa-solid fa-triangle-exclamation"></i> Preview Mode</span>}
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={copyPortalUrl} className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500 transition-all group text-left">
                     <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-400 border border-blue-500/20 group-hover:bg-blue-600/20">
                        <i className={`fa-solid ${urlCopied ? 'fa-check' : 'fa-link'}`}></i>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-white font-black text-[9px] uppercase">Base Portal Link</span>
                        <span className="text-slate-500 text-[8px] uppercase">Safe URL for friends</span>
                     </div>
                  </button>
                  <div className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl group text-left">
                     <div className="w-9 h-9 rounded-lg bg-purple-600/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
                        <i className="fa-solid fa-key"></i>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-white font-black text-[9px] uppercase">Code Sharing</span>
                        <span className="text-slate-500 text-[8px] uppercase">Manual entry method</span>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 animate-fade-in w-full max-w-4xl">
           <div className="bg-slate-900/50 backdrop-blur-xl p-16 rounded-[40px] border border-slate-700 shadow-2xl w-full flex flex-col items-center gap-10">
             
             <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 mb-2">
                   <div className={`w-2 h-2 rounded-full ${connStatus === 'connected' ? 'bg-green-500' : connStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                     Gate Link: {connStatus === 'connected' ? 'Synchronized' : connStatus === 'connecting' ? 'Synchronizing...' : 'Severed'}
                   </span>
                </div>
                <span className="text-blue-500 font-black text-[10px] uppercase tracking-[0.5em]">Active Singularity Code</span>
                <div className="text-7xl font-black text-white font-mono bg-slate-950 px-10 py-6 rounded-3xl border-2 border-slate-800 shadow-[0_0_40px_rgba(0,0,0,0.5)] tracking-[0.2em] relative group">
                  <div className="absolute inset-0 bg-blue-500/5 animate-pulse rounded-3xl pointer-events-none"></div>
                  {gameState.matchId}
                </div>
                <div className="flex items-center gap-4 mt-6">
                  <button onClick={copyInviteLink} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${copied ? 'bg-green-600 text-white' : 'bg-slate-800 text-blue-400 border border-slate-700 hover:bg-slate-700'}`}>
                    <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                    {copied ? 'Link Copied' : 'Copy Direct Warp Link'}
                  </button>
                </div>
             </div>

             <div className="flex items-center gap-12 w-full justify-center">
                <div className="flex flex-col items-center gap-4 group">
                   <div className="w-24 h-24 bg-blue-600/20 border-2 border-blue-500 rounded-full flex items-center justify-center text-4xl text-blue-400 animate-pulse shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                     <i className="fa-solid fa-user"></i>
                   </div>
                   <div className="flex flex-col items-center">
                     <span className="text-white font-black uppercase tracking-widest text-sm">{gameState.localUsername}</span>
                     <span className={`text-[8px] font-black px-2 py-0.5 rounded mt-1 uppercase ${gameState.isHost ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-700 text-slate-400'}`}>
                       {gameState.isHost ? 'Sector Master' : 'Challenger'}
                     </span>
                   </div>
                </div>
                
                <div className="flex flex-col items-center gap-2">
                   <div className="w-16 h-[1px] bg-slate-700 relative">
                     <div className="absolute inset-0 bg-blue-400 animate-ping opacity-30"></div>
                   </div>
                   <div className="flex items-center gap-2">
                      <i className="fa-solid fa-circle-nodes text-slate-600 text-xl"></i>
                      <div className="flex gap-0.5">
                        {[1,2,3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{animationDelay: `${i*200}ms`}} />)}
                      </div>
                   </div>
                </div>

                <div className="flex flex-col items-center gap-4">
                   <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl border-2 transition-all duration-1000 ${gameState.remoteUsername ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-[0_0_20px_rgba(147,51,234,0.3)] scale-110' : 'bg-slate-800 border-slate-700 text-slate-600 border-dashed animate-pulse'}`}>
                     <i className={`fa-solid ${gameState.remoteUsername ? 'fa-user-check' : 'fa-spinner fa-spin'}`}></i>
                   </div>
                   <div className="flex flex-col items-center">
                     <span className={`font-black uppercase tracking-widest text-sm transition-colors ${gameState.remoteUsername ? 'text-white' : 'text-slate-600'}`}>
                       {gameState.remoteUsername || 'Seeking Rival...'}
                     </span>
                   </div>
                </div>
             </div>

             {gameState.remoteUsername ? (
               <button onClick={() => setGameState(prev => ({ ...prev, phase: 'prep' }))} className="px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase italic tracking-tighter rounded-2xl transition-all transform hover:scale-105 shadow-2xl">
                 Initialize Prep Sector
               </button>
             ) : (
               <div className="px-12 py-5 bg-slate-800/50 text-slate-500 font-black uppercase italic tracking-widest rounded-2xl border border-slate-700 animate-pulse flex items-center gap-3">
                 <i className="fa-solid fa-satellite-dish"></i>
                 Broadcasting Signal...
               </div>
             )}

             <button onClick={handleQuit} className="text-slate-500 hover:text-white font-bold uppercase text-[10px] tracking-widest transition-colors flex items-center gap-2">
               <i className="fa-solid fa-power-off"></i>
               Return to Main Gate
             </button>
           </div>
        </div>
      )}

      {gameState.phase === 'prep' && (
        <div className="flex-1 w-full flex flex-col items-center overflow-y-auto p-8 gap-8 animate-fade-in">
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase">PREP SECTOR</h2>
            <div className="flex gap-4">
               <div className="bg-slate-900 border border-slate-700 px-4 py-1.5 rounded-full flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${gameState.localReady ? 'bg-green-500' : 'bg-red-500'}`}></div>
                 <span className="text-[10px] font-black text-white uppercase tracking-widest">{gameState.localUsername}</span>
               </div>
               {gameState.gameMode === 'MULTIPLAYER' && (
                 <div className="bg-slate-900 border border-slate-700 px-4 py-1.5 rounded-full flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full ${gameState.remoteReady ? 'bg-green-500' : 'bg-red-500'}`}></div>
                   <span className="text-[10px] font-black text-white uppercase tracking-widest">{gameState.remoteUsername || 'FOE'}</span>
                 </div>
               )}
            </div>
          </div>

          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
            <div className="space-y-8">
              <CharacterSelect 
                characters={CHARACTERS} 
                onSelect={handleCharacterSelect} 
                isWarping={false}
                selectedId={gameState.localSelectedChar?.id}
                remoteId={gameState.remoteSelectedChar?.id}
              />
            </div>
            
            <div className="flex flex-col gap-6">
              <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Battle Sector</span>
                </div>
                <div className="flex flex-col gap-2">
                  {ARENAS.map(arena => (
                    <button 
                      key={arena.id} 
                      disabled={!gameState.isHost}
                      onClick={() => handleArenaSelect(arena.id)} 
                      className={`w-full px-4 py-3 rounded-xl text-xs font-black uppercase text-left transition-all border ${gameState.selectedArenaId === arena.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'} ${!gameState.isHost ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                    >
                      {arena.name}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={toggleReady} 
                disabled={!gameState.localSelectedChar}
                className={`w-full py-6 rounded-3xl font-black uppercase italic tracking-tighter text-xl transition-all shadow-2xl ${gameState.localReady ? 'bg-green-600 text-white scale-95 shadow-[0_0_30px_rgba(22,163,74,0.4)]' : 'bg-blue-600 hover:bg-blue-500 text-white hover:-translate-y-1 shadow-[0_0_30px_rgba(37,99,235,0.4)]'}`}
              >
                {!gameState.localSelectedChar ? 'Select Champion' : gameState.localReady ? 'READY!' : 'LOCK IN'}
              </button>
              
              <button onClick={handleQuit} className="text-slate-500 hover:text-white font-bold uppercase text-[10px] tracking-widest text-center transition-colors">
                 Sever Singularity
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'battle' && gameState.player && gameState.enemy && (
        <div className="flex flex-col w-full h-full">
          <HUD player={gameState.player} enemy={gameState.enemy} isPaused={!!gameState.isPaused} tacticalAdvice={gameState.tacticalAdvice} matchId={gameState.matchId} mode="header" localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
          <main className="flex-1 flex items-center justify-center bg-slate-900/50 relative overflow-hidden">
            <div className="transform scale-[0.9] lg:scale-[0.95] xl:scale-100 transition-transform duration-500">
               <GameCanvas gameState={gameState} setGameState={setGameState} onGameOver={handleGameOver} />
            </div>
          </main>
          <HUD player={gameState.player} enemy={gameState.enemy} isPaused={!!gameState.isPaused} tacticalAdvice={gameState.tacticalAdvice} mode="footer" localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
        </div>
      )}

      {gameState.phase === 'results' && gameState.player && gameState.enemy && (
        <PostMatch winner={gameState.winner!} player={gameState.player} enemy={gameState.enemy} onRestart={handleQuit} localName={gameState.localUsername} remoteName={gameState.remoteUsername} />
      )}

      {isWarping && (
        <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-2xl flex flex-col items-center justify-center animate-fade-in text-center">
           <div className="relative w-64 h-64 flex items-center justify-center">
              <div className="w-32 h-32 border-8 border-t-blue-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin shadow-[0_0_50px_rgba(59,130,246,0.5)]" />
              <i className="fa-solid fa-dharmachakra text-white text-4xl animate-pulse absolute" />
           </div>
           <h3 className="text-4xl font-black text-white italic uppercase tracking-tighter mt-8">INITIATING ZENITH WARP</h3>
        </div>
      )}
    </div>
  );
};

export default App;