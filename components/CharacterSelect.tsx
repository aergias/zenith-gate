import React, { useState } from 'react';
import { CharacterTemplate } from '../types';
import CharacterSheet from './CharacterSheet';
import { soundService } from '../services/soundService';

interface Props {
  characters: CharacterTemplate[];
  onSelect: (char: CharacterTemplate) => void;
  isWarping: boolean;
  selectedId?: string;
  remoteId?: string;
}

const CharacterSelect: React.FC<Props> = ({ characters, onSelect, isWarping, selectedId, remoteId }) => {
  const [detailedChar, setDetailedChar] = useState<CharacterTemplate | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const itemsPerPage = 3;

  const handleLearnMore = (char: CharacterTemplate) => {
    if (isWarping) return;
    soundService.playUI();
    setDetailedChar(char);
  };

  const handleLockIn = (char: CharacterTemplate) => {
    if (isWarping) return;
    soundService.playVictory();
    onSelect(char);
  };

  const handlePrev = () => {
    if (isWarping) return;
    soundService.playUI();
    setStartIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    if (isWarping) return;
    soundService.playUI();
    setStartIndex(prev => Math.min(characters.length - itemsPerPage, prev + 1));
  };

  const visibleCharacters = characters.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="flex flex-col items-center gap-10 p-4 w-full animate-fade-in relative">
      <div className="flex items-center gap-4 w-full px-12">
        <button disabled={startIndex === 0 || isWarping} onClick={handlePrev} className={`absolute left-0 z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all ${startIndex === 0 || isWarping ? 'opacity-20 cursor-not-allowed' : 'bg-slate-800/50 hover:bg-blue-600 text-white shadow-lg'}`}>
          <i className="fa-solid fa-chevron-left text-xl"></i>
        </button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full transition-all duration-500 ease-in-out">
          {visibleCharacters.map((char) => {
            const isLocal = selectedId === char.id;
            const isRemote = remoteId === char.id;
            return (
              <div 
                key={char.id} 
                onClick={() => handleLockIn(char)}
                className={`group relative flex flex-col bg-slate-900 border-2 rounded-2xl overflow-hidden transition-all duration-300 transform cursor-pointer ${isWarping ? 'opacity-50' : 'hover:-translate-y-2'} ${isLocal ? 'shadow-[0_0_25px_rgba(255,255,255,0.1)]' : isRemote ? 'border-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.3)]' : 'border-slate-800 hover:border-slate-600'}`}
                style={{ borderColor: isLocal ? char.color : undefined }}
              >
                <div className="h-48 overflow-hidden bg-slate-800 relative">
                   <img src={char.avatar} alt={char.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                   <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                   <div className="absolute bottom-3 left-3">
                     <h2 className="text-2xl font-black text-white leading-none italic uppercase">{char.name}</h2>
                     <p className="font-bold uppercase tracking-wider text-[9px] mt-1" style={{ color: char.color }}>{char.role}</p>
                   </div>
                   {(isLocal || isRemote) && (
                     <div className="absolute top-3 right-3 flex gap-1">
                        {isLocal && <span className="px-2 py-0.5 text-[8px] font-black text-white rounded uppercase shadow-lg" style={{ backgroundColor: char.color }}>YOU</span>}
                        {isRemote && <span className="px-2 py-0.5 bg-purple-600 text-[8px] font-black text-white rounded uppercase shadow-lg">FOE</span>}
                     </div>
                   )}
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                     <div className="flex flex-col">
                       <span className="text-[8px] text-slate-500 uppercase font-black">Resilience</span>
                       <div className="w-full bg-slate-800 h-1 rounded-full mt-1">
                         <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(char.stats.maxHp / 1600) * 100}%`, backgroundColor: char.color }} />
                       </div>
                     </div>
                     <div className="flex flex-col text-[8px] text-slate-500 uppercase font-black">
                       <span>Difficulty</span>
                       <div className="flex gap-1 mt-1">{[1,2,3].map(i => (<div key={i} className={`h-1 flex-1 rounded-full ${i <= char.difficulty ? 'bg-amber-400' : 'bg-slate-800'}`} />))}</div>
                     </div>
                  </div>
                </div>
                <div className="flex border-t border-slate-800">
                  <button disabled={isWarping} onClick={(e) => { e.stopPropagation(); handleLearnMore(char); }} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-slate-500 font-black uppercase text-[9px] tracking-widest transition-colors italic">Analyze Data</button>
                </div>
              </div>
            );
          })}
        </div>

        <button disabled={startIndex >= characters.length - itemsPerPage || isWarping} onClick={handleNext} className={`absolute right-0 z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all ${startIndex >= characters.length - itemsPerPage || isWarping ? 'opacity-20 cursor-not-allowed' : 'bg-slate-800/50 hover:bg-blue-600 text-white shadow-lg'}`}>
          <i className="fa-solid fa-chevron-right text-xl"></i>
        </button>
      </div>

      <div className="flex gap-2">
        {Array.from({ length: Math.ceil(characters.length / itemsPerPage) + 1 }).map((_, i) => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${startIndex >= i && startIndex < i + itemsPerPage ? 'bg-blue-500 w-4' : 'bg-slate-800'}`} />
        ))}
      </div>

      {detailedChar && <CharacterSheet character={detailedChar} isWarping={isWarping} onClose={() => setDetailedChar(null)} onSelect={(char) => { setDetailedChar(null); handleLockIn(char); }} />}
    </div>
  );
};

export default CharacterSelect;