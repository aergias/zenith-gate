import React from 'react';
import { Player } from '../types';

interface PlayerListProps {
  players: Player[];
  currentUser: Player;
}

const PlayerList: React.FC<PlayerListProps> = ({ players, currentUser }) => {
  return (
    <div className="space-y-6 flex-1 overflow-y-auto pr-2">
      <h3 className="font-orbitron text-[9px] tracking-[0.4em] text-[#d4af37]/40 px-2 uppercase mb-4 sticky top-0 bg-transparent">
        Resonance Manifest
      </h3>
      <div className="space-y-4">
        {players.map((player) => (
          <div key={player.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500 group ${player.id === currentUser.id ? 'bg-[#d4af37]/5 border-[#d4af37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)]' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}>
            <div className="relative">
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 group-hover:border-[#d4af37]/30 transition-colors">
                <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
              </div>
              <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-[3px] border-[#0a0a14] ${player.status === 'ready' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-cinzel tracking-widest truncate text-sm ${player.id === currentUser.id ? 'text-[#d4af37]' : 'text-white/80'}`}>
                {player.name}
                {player.id === currentUser.id && <span className="ml-2 text-[8px] font-orbitron text-[#d4af37]/50">(LOCAL)</span>}
              </p>
              <p className="text-[9px] text-white/30 uppercase tracking-[0.2em] font-orbitron mt-1 flex items-center gap-2">
                <span className={player.status === 'ready' ? 'text-emerald-500' : 'text-amber-500/60'}>
                  {player.status === 'ready' ? 'ALIGNED' : 'ALIGNING...'}
                </span>
                <span className="opacity-20">•</span>
                <span>{player.role === 'ai-host' ? 'ZENITH ENGINE' : 'SEEKER'}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlayerList;