
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl animate-fade-in p-4 overflow-y-auto">
      <div className="max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col md:flex-row relative">
        <button 
          disabled={isWarping}
          onClick={onClose}
          className={`absolute top-6 right-6 text-slate-400 hover:text-white transition-colors z-10 ${isWarping ? 'opacity-0' : 'opacity-100'}`}
        >
          <i className="fa-solid fa-xmark text-2xl"></i>
        </button>

        {/* Left Side: Visuals */}
        <div className="w-full md:w-2/5 bg-slate-800 relative min-h-[300px]">
          <img src={character.avatar} className="w-full h-full object-cover opacity-80" alt={character.name} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
          <div className="absolute bottom-8 left-8">
            <h2 className="text-5xl font-black text-white uppercase italic tracking-tighter">{character.name}</h2>
            <p className="text-blue-400 font-bold uppercase tracking-widest text-sm">{character.role}</p>
          </div>
        </div>

        {/* Right Side: Data */}
        <div className="w-full md:w-3/5 p-8 flex flex-col gap-8">
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fa-solid fa-book-open"></i> Biography
            </h3>
            <p className="text-slate-300 leading-relaxed italic text-sm">
              {character.bio}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Core Stats</h3>
              <div className="space-y-3">
                <StatRow label="Health" value={character.stats.maxHp} color="bg-green-500" max={1500} />
                <StatRow label="Mana" value={character.stats.maxMana} color="bg-blue-500" max={500} />
                <StatRow label="Speed" value={character.stats.speed} color="bg-cyan-400" max={850} />
                <StatRow label="Attack" value={character.stats.baseAttackDamage} color="bg-red-400" max={100} />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Details</h3>
              <ul className="text-sm space-y-2 text-slate-300">
                <li className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Attack Range</span>
                  <span className="text-white font-mono">{character.stats.attackRange}u</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Attack Speed</span>
                  <span className="text-white font-mono">{character.stats.attackSpeed}a/s</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Mana Regen</span>
                  <span className="text-white font-mono">{character.stats.manaRegen}mp/s</span>
                </li>
                <li className="flex justify-between">
                  <span>Difficulty</span>
                  <span className="flex gap-1">
                    {[1,2,3].map(i => (
                      <div key={i} className={`w-3 h-1.5 rounded-full ${i <= character.difficulty ? 'bg-amber-400' : 'bg-slate-800'}`} />
                    ))}
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Abilities</h3>
            <div className="space-y-4">
              {character.abilities.map(ability => (
                <div key={ability.id} className="flex gap-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 group">
                  <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center text-2xl border border-slate-600 shadow-inner group-hover:border-blue-500 transition-colors">
                    {ability.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white text-sm">{ability.name} <span className="text-blue-500 text-xs ml-1">[{ability.id.toUpperCase()}]</span></span>
                      <div className="flex gap-3 text-[10px] font-mono text-slate-400 uppercase">
                        <span>{ability.manaCost} MP</span>
                        <span>{ability.cooldown / 1000}s CD</span>
                      </div>
                    </div>
                    <p className="text-slate-400 text-xs leading-snug">
                      {ability.detailedDescription || ability.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-auto pt-4 flex gap-4">
             <button 
               disabled={isWarping}
               onClick={onClose}
               className="flex-1 py-4 border border-slate-700 hover:bg-slate-800 text-slate-400 font-bold uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50"
             >
               Go Back
             </button>
             <button 
               disabled={isWarping}
               onClick={() => onSelect(character)}
               className={`flex-[2] py-4 font-black uppercase italic tracking-tighter rounded-xl transition-all shadow-xl flex items-center justify-center gap-3 ${isWarping ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'}`}
             >
               {isWarping ? (
                 <>
                   <i className="fa-solid fa-shuttle-space animate-bounce"></i>
                   <span>Initiating Warp Sequence...</span>
                 </>
               ) : (
                 'Confirm Selection'
               )}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatRow = ({ label, value, color, max }: { label: string, value: number, color: string, max: number }) => (
  <div className="flex flex-col">
    <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold mb-1">
      <span>{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
    <div className="w-full bg-slate-800 h-1 rounded-full">
      <div className={`${color} h-full rounded-full transition-all duration-1000`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  </div>
);

export default CharacterSheet;
