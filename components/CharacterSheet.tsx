import React from 'react';
import { CharacterTemplate } from '../types';

interface Props {
  character: CharacterTemplate;
  isWarping: boolean;
  onClose: () => void;
  onSelect: (char: CharacterTemplate) => void;
}

const CharacterSheet: React.FC<Props> = ({ character, isWarping, onClose, onSelect }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in p-4">
      <div className="max-w-6xl w-full max-h-[90vh] bg-slate-900 border border-slate-700 rounded-[40px] shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative">
        
        {/* Header Section */}
        <div className="flex items-center justify-between p-8 bg-slate-800/30 border-b border-slate-800">
           <div className="flex flex-col">
              <h2 className="text-5xl font-black text-white uppercase italic tracking-tighter leading-none" style={{ color: character.color }}>{character.name}</h2>
              <p className="font-bold uppercase tracking-[0.4em] text-xs mt-2" style={{ color: character.accentColor }}>{character.role}</p>
           </div>
           <button 
             disabled={isWarping}
             onClick={onClose}
             className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center justify-center"
           >
             <i className="fa-solid fa-xmark text-xl"></i>
           </button>
        </div>

        {/* Main Dashboard Layout */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Column 1: Identity & Bio */}
          <div className="w-1/4 border-r border-slate-800 p-8 flex flex-col gap-6">
            <div className="aspect-square rounded-3xl overflow-hidden border-2 border-slate-800 shadow-inner" style={{ borderColor: character.color }}>
               <img src={character.avatar} className="w-full h-full object-cover" alt={character.name} />
            </div>
            <div className="space-y-3">
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <i className="fa-solid fa-fingerprint" style={{ color: character.color }}></i> Identity Trace
               </span>
               <p className="text-slate-300 text-xs leading-relaxed italic opacity-80">
                 {character.bio}
               </p>
            </div>
          </div>

          {/* Column 2: Tactical Data (Stats) */}
          <div className="w-1/4 border-r border-slate-800 p-8 flex flex-col gap-6 bg-slate-950/20">
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
               <i className="fa-solid fa-chart-simple" style={{ color: character.color }}></i> Combat Matrix
             </span>
             
             <div className="space-y-5">
                <StatRow label="Resilience" value={character.stats.maxHp} overrideColor={character.color} max={1600} icon="fa-heart" />
                <StatRow label="Gate Capacity" value={character.stats.maxMana} color="bg-blue-500" max={600} icon="fa-bolt" />
                <StatRow label="Warp Velocity" value={character.stats.speed} color="bg-cyan-400" max={1000} icon="fa-wind" />
                <StatRow label="Impact Force" value={character.stats.baseAttackDamage} color="bg-red-500" max={100} icon="fa-burst" />
             </div>

             <div className="mt-auto pt-6 border-t border-slate-800 space-y-3">
                <div className="flex justify-between items-center text-[10px] uppercase font-black">
                   <span className="text-slate-500">Rival Complexity</span>
                   <div className="flex gap-1">
                      {[1,2,3].map(i => (
                        <div key={i} className={`w-3 h-3 rounded-full ${i <= character.difficulty ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)]' : 'bg-slate-800'}`} />
                      ))}
                   </div>
                </div>
                <div className="flex justify-between items-center text-[10px] uppercase font-black text-slate-500">
                   <span>Engage Distance</span>
                   <span className="text-white">{character.stats.attackRange}u</span>
                </div>
             </div>
          </div>

          {/* Column 3: Singularity Skills (Abilities) */}
          <div className="flex-1 p-8 overflow-hidden flex flex-col">
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-6">
               <i className="fa-solid fa-microchip" style={{ color: character.color }}></i> Ability Manifest
             </span>
             
             <div className="grid grid-cols-2 gap-4">
                {character.abilities.map(ability => (
                  <div key={ability.id} className="p-4 bg-slate-800/40 rounded-3xl border border-slate-700/50 hover:border-blue-500/50 transition-all group flex gap-4">
                    <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-3xl border border-slate-700 group-hover:scale-110 transition-transform shadow-inner shrink-0">
                      {ability.icon}
                    </div>
                    <div className="flex flex-col justify-center overflow-hidden">
                       <div className="flex items-center gap-2 mb-1">
                          <span className="font-black text-white text-xs uppercase italic">{ability.name}</span>
                          <span className="bg-slate-700 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase">{ability.id}</span>
                       </div>
                       <p className="text-slate-400 text-[10px] leading-tight line-clamp-2">
                         {ability.description}
                       </p>
                    </div>
                  </div>
                ))}
             </div>

             {/* Bottom Action Section */}
             <div className="mt-auto flex gap-4 pt-8">
                <button 
                  disabled={isWarping}
                  onClick={onClose}
                  className="px-8 py-5 border border-slate-700 hover:bg-slate-800 text-slate-500 hover:text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all disabled:opacity-50"
                >
                  Return to List
                </button>
                <button 
                  disabled={isWarping}
                  onClick={() => onSelect(character)}
                  className={`flex-1 py-5 font-black uppercase italic tracking-tighter text-lg rounded-2xl transition-all shadow-2xl flex items-center justify-center gap-4 ${isWarping ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'hover:brightness-110 text-white transform hover:-translate-y-1'}`}
                  style={{ backgroundColor: character.color }}
                >
                  {isWarping ? (
                    <>
                      <i className="fa-solid fa-dna animate-pulse"></i>
                      <span>Synchronizing...</span>
                    </>
                  ) : (
                    <>
                      <span>Lock In {character.name}</span>
                      <i className="fa-solid fa-chevron-right"></i>
                    </>
                  )}
                </button>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

const StatRow = ({ label, value, color, max, icon, overrideColor }: { label: string, value: number, color?: string, max: number, icon: string, overrideColor?: string }) => (
  <div className="flex flex-col gap-2">
    <div className="flex justify-between text-[10px] text-slate-500 uppercase font-black">
      <div className="flex items-center gap-2">
         <i className={`fa-solid ${icon} text-[8px]`}></i>
         <span>{label}</span>
      </div>
      <span className="text-white">{value}</span>
    </div>
    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 p-[1px]">
      <div className={`${color || ''} h-full rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(255,255,255,0.1)]`} style={{ width: `${(value / max) * 100}%`, backgroundColor: overrideColor }} />
    </div>
  </div>
);

export default CharacterSheet;