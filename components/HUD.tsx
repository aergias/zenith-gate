import React, { useState, useEffect } from 'react';
import { Entity, AbilityKey, StatusType } from '../types';
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
  const [spectators, setSpectators] = useState(12400);
  const [hype, setHype] = useState(65);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpectators(prev => prev + Math.floor(Math.random() * 50) - 20);
      setHype(prev => {
        const target = (player.stats.hp / player.stats.maxHp < 0.3) ? 85 : 55;
        return Math.max(10, Math.min(100, prev + (target - prev) * 0.1));
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [player.stats.hp, player.stats.maxHp]);

  const handleToggleMute = () => {
    const newState = soundService.toggleMute();
    setIsMuted(newState);
  };

  const getShield = (ent: Entity) => ent.buffs.find(b => b.type === StatusType.SHIELD);

  const renderStatus = (ent: Entity) => (
    <div className="flex gap-1">
      {ent.buffs.map((b, i) => (
        <div key={`${b.type}-${i}`} className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border animate-pulse ${
          b.type === StatusType.BURN ? 'bg-orange-900/40 border-orange-500 text-orange-400' :
          b.type === StatusType.SLOW ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400' :
          b.type === StatusType.STUN ? 'bg-yellow-900/40 border-yellow-500 text-yellow-400' :
          b.type === StatusType.SHIELD ? 'bg-slate-100/20 border-white text-white' :
          'bg-blue-900/40 border-blue-500 text-blue-400'
        }`}>
          {b.type} {b.type === StatusType.SHIELD ? `[${Math.ceil(b.value || 0)}]` : ''} {Math.ceil(b.timer / 1000)}s
        </div>
      ))}
    </div>
  );

  if (mode === 'header') {
    return (
      <header className="w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 p-4 flex items-center justify-between shadow-2xl relative z-50">
        <div className="flex items-center gap-6 flex-1">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Universal Link</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-400 font-mono uppercase">{matchId || 'ZENITH_INSTANCE_01'}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
          <div className="h-8 w-[1px] bg-slate-700" />
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Spectators</span>
            <span className="text-xs text-white font-mono">{spectators.toLocaleString()} LIVE</span>
          </div>
        </div>

        <div className="flex flex-col items-center flex-1 max-w-md">
           <div className="flex justify-between w-full mb-1 px-1">
              <span className="font-black uppercase text-[10px] tracking-widest" style={{ color: enemy.template.color }}>{remoteName || enemy.template.name}</span>
              <span className="font-bold text-[10px] tabular-nums" style={{ color: enemy.template.color }}>{Math.ceil(Math.max(0, enemy.stats.hp))} HP</span>
           </div>
           <div className="w-full h-2.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden relative">
             <div className="h-full transition-all duration-150 shadow-[0_0_10px_rgba(255,255,255,0.1)]" 
                  style={{ 
                    width: `${Math.max(0, (enemy.stats.hp / enemy.stats.maxHp) * 100)}%`,
                    backgroundColor: enemy.template.color 
                  }} />
           </div>
           <div className="mt-1">{renderStatus(enemy)}</div>
        </div>

        <div className="flex justify-end items-center gap-4 flex-1">
          {tacticalAdvice && !isPaused && (
             <div className="bg-blue-900/10 border border-blue-500/20 px-3 py-1.5 rounded-lg max-w-xs hidden xl:block">
               <p className="text-[9px] text-blue-300 italic leading-tight uppercase font-medium">Zenith Core: "{tacticalAdvice}"</p>
             </div>
          )}
          <button onClick={handleToggleMute} className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-all">
            <i className={`fa-solid ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}`}></i>
          </button>
        </div>
      </header>
    );
  }

  return (
    <footer className="w-full bg-slate-900/90 backdrop-blur-lg border-t border-slate-700/50 p-6 flex items-center justify-center gap-12 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] relative z-50">
      <div className="flex items-center gap-8">
        <div className="flex flex-col gap-2 w-80">
          <div className="flex justify-between px-1">
            <span className="font-black text-[10px] uppercase tracking-widest" style={{ color: player.template.color }}>{localName}</span>
            <span className="text-white font-black text-[10px] tabular-nums">{Math.ceil(Math.max(0, player.stats.hp))} / {player.stats.maxHp} HP</span>
          </div>
          <div className="h-4 bg-slate-950 border border-slate-800 rounded-full overflow-hidden relative shadow-inner">
            <div className="h-full transition-all duration-150 shadow-[0_0_15px_rgba(255,255,255,0.1)]" 
                 style={{ 
                    width: `${Math.max(0, (player.stats.hp / player.stats.maxHp) * 100)}%`,
                    backgroundColor: player.template.color 
                 }} />
            {getShield(player) && <div className="absolute inset-y-0 left-0 bg-white/30 border-r border-white/40" style={{ width: `${Math.min(100, (getShield(player)!.value! / player.stats.maxHp) * 100)}%` }} />}
          </div>
          <div className="h-2 bg-slate-950 border border-slate-800 rounded-full overflow-hidden relative">
            <div className="h-full bg-gradient-to-r from-slate-700 via-blue-600 to-cyan-400 transition-all duration-150" style={{ width: `${Math.max(0, (player.stats.mana / player.stats.maxMana) * 100)}%` }} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
           <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Hype Meter</span>
           <div className="w-2 h-20 bg-slate-800 rounded-full overflow-hidden flex flex-col justify-end">
              <div className="w-full bg-gradient-to-t from-orange-500 to-yellow-300 transition-all duration-1000" style={{ height: `${hype}%` }} />
           </div>
        </div>
      </div>

      <div className="flex gap-3 bg-slate-900/50 p-4 rounded-3xl border border-slate-700/30">
        {player.template.abilities.map(ability => {
          const isCooldown = ability.currentCooldown > 0;
          const canAfford = player.stats.mana >= ability.manaCost;
          const isStunned = player.buffs.some(b => b.type === StatusType.STUN);
          return (
            <div key={ability.id} className={`relative w-16 h-16 bg-slate-950 border-2 rounded-2xl flex flex-col items-center justify-center transition-all overflow-hidden ${isCooldown || isStunned ? 'border-slate-800 opacity-60' : !canAfford ? 'border-red-900/40' : 'border-blue-600 hover:border-blue-400 hover:scale-105 shadow-xl'}`}>
              <span className={`text-2xl ${isCooldown || isStunned ? 'opacity-30' : 'opacity-100'}`}>{ability.icon}</span>
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-slate-800/80 rounded flex items-center justify-center text-[8px] font-black text-white">{ability.id.toUpperCase()}</div>
              {isCooldown && <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white font-black text-xs italic">{Math.ceil(ability.currentCooldown / 1000)}</div>}
              {isStunned && !isCooldown && <div className="absolute inset-0 flex items-center justify-center bg-yellow-900/40"><i className="fa-solid fa-lock text-yellow-400 text-sm"></i></div>}
            </div>
          );
        })}
      </div>
    </footer>
  );
};

export default HUD;