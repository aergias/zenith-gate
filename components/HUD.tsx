import React, { useState } from 'react';
import { Entity } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  player: Entity;
  enemy: Entity;
  isPaused: boolean;
  tacticalAdvice?: string;
  matchId?: string;
  mode: 'header' | 'footer';
  localName: string;
  remoteName?: string;
}

const HUD: React.FC<Props> = ({ player, enemy, isPaused, tacticalAdvice, matchId, mode, localName, remoteName }) => {
  const [isMuted, setIsMuted] = useState(soundService.isMuted());

  const handleToggleMute = () => {
    const newState = soundService.toggleMute();
    setIsMuted(newState);
  };

  if (mode === 'header') {
    return (
      <header className="w-full h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between z-50 flex-shrink-0">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sector Link</span>
          <span className="text-xs text-blue-400 font-mono tracking-wider">{matchId || 'SOLO_TRAINING'}</span>
        </div>

        <div className="flex flex-col items-center flex-1 max-w-sm px-8">
           <div className="flex justify-between w-full mb-1">
              <span className="font-black text-[10px] text-white uppercase italic tracking-wider">{remoteName || enemy.template.name}</span>
              <span className="font-bold text-[10px] text-red-500">{Math.ceil(Math.max(0, enemy.stats.hp))} HP</span>
           </div>
           <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
             <div className="h-full transition-all duration-300 shadow-[0_0_10px_rgba(255,255,255,0.1)]" style={{ width: `${(enemy.stats.hp / enemy.stats.maxHp) * 100}%`, backgroundColor: enemy.template.color }} />
           </div>
        </div>

        <button onClick={handleToggleMute} className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-all">
          <i className={`fa-solid ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}`}></i>
        </button>
      </header>
    );
  }

  return (
    <footer className="w-full h-24 bg-slate-900 border-t border-slate-800 px-10 flex items-center justify-between z-50 flex-shrink-0">
      <div className="flex flex-col gap-1 w-64">
        <div className="flex justify-between">
          <span className="font-black text-[10px] text-white uppercase italic tracking-wider">{localName}</span>
          <span className="text-white font-black text-[10px]">{Math.ceil(Math.max(0, player.stats.hp))} / {player.stats.maxHp}</span>
        </div>
        <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 mb-0.5">
          <div className="h-full transition-all duration-300 shadow-[0_0_15px_rgba(255,255,255,0.2)]" style={{ width: `${(player.stats.hp / player.stats.maxHp) * 100}%`, backgroundColor: player.template.color }} />
        </div>
        <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.3)]" style={{ width: `${(player.stats.mana / player.stats.maxMana) * 100}%` }} />
        </div>
      </div>

      <div className="flex gap-3">
        {player.template.abilities.map(ability => (
          <div key={ability.id} className={`relative w-14 h-14 bg-slate-950 border-2 rounded-xl flex flex-col items-center justify-center transition-all overflow-hidden ${ability.currentCooldown > 0 ? 'border-slate-800 opacity-60 scale-95' : 'border-blue-600 hover:border-blue-400 cursor-pointer shadow-[0_0_15px_rgba(37,99,235,0.2)]'}`}>
            <span className="text-xl">{ability.icon}</span>
            <div className="absolute top-0.5 left-1 w-3 h-3 flex items-center justify-center text-[7px] font-black text-slate-400 uppercase">{ability.id}</div>
            {ability.currentCooldown > 0 && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white font-black text-xs">
                {Math.ceil(ability.currentCooldown / 1000)}
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600/30">
               <div className="h-full bg-blue-400" style={{ width: `${(1 - (ability.currentCooldown / ability.cooldown)) * 100}%` }}></div>
            </div>
          </div>
        ))}
      </div>

      <div className="max-w-xs text-right hidden lg:flex flex-col">
        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">Tactical Core Advice</span>
        <p className="text-[10px] text-blue-400 font-bold uppercase italic leading-tight">"{tacticalAdvice}"</p>
      </div>
    </footer>
  );
};

export default HUD;