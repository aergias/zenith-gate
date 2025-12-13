import React from 'react';
import { Entity } from '../types';

interface Props {
  winner: 'player' | 'enemy' | 'Player1' | 'Player2';
  player: Entity;
  enemy: Entity;
  onRestart: () => void;
  localName: string;
  remoteName?: string;
}

const PostMatch: React.FC<Props> = ({ winner, player, enemy, onRestart, localName, remoteName }) => {
  const isWinner = winner === 'player' || winner === 'Player1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in p-10">
      <div className="max-w-2xl w-full flex flex-col items-center gap-8 text-center">
        <div 
          className="text-8xl font-black italic tracking-tighter uppercase drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]"
          style={{ color: isWinner ? player.template.color : enemy.template.color }}
        >
          {isWinner ? 'Victory' : 'Defeat'}
        </div>

        <div className="grid grid-cols-2 gap-12 w-full mt-4">
           <div className="flex flex-col items-center gap-2">
              <div 
                className="w-32 h-32 rounded-full border-4 overflow-hidden shadow-xl"
                style={{ borderColor: player.template.color }}
              >
                <img src={player.template.avatar} className="w-full h-full object-cover" alt="Player" />
              </div>
              <span className="font-black text-white text-xl uppercase tracking-widest">{localName}</span>
              <span className="font-bold text-[10px] uppercase tracking-[0.3em]" style={{ color: player.template.color }}>
                {player.template.name}
              </span>
           </div>
           
           <div className="flex flex-col items-center gap-2">
              <div 
                className="w-32 h-32 rounded-full border-4 overflow-hidden shadow-xl"
                style={{ borderColor: enemy.template.color }}
              >
                <img src={enemy.template.avatar} className="w-full h-full object-cover" alt="Enemy" />
              </div>
              <span className="font-black text-white text-xl uppercase tracking-widest">{remoteName || 'Challenger'}</span>
              <span className="font-bold text-[10px] uppercase tracking-[0.3em]" style={{ color: enemy.template.color }}>
                {enemy.template.name}
              </span>
           </div>
        </div>

        <button 
          onClick={onRestart}
          className="mt-8 px-12 py-4 bg-slate-800 hover:bg-slate-700 text-white text-xl font-black uppercase italic tracking-tighter rounded-full transition-all transform hover:scale-105 shadow-2xl border-2"
          style={{ borderColor: isWinner ? player.template.color : '#475569' }}
        >
          Return to Arena
        </button>
      </div>
    </div>
  );
};

export default PostMatch;