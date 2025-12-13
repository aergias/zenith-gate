
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
        <div className={`text-8xl font-black italic tracking-tighter uppercase ${isWinner ? 'text-blue-500 drop-shadow-[0_0_30px_rgba(59,130,246,0.6)]' : 'text-red-600 drop-shadow-[0_0_30px_rgba(220,38,38,0.6)]'}`}>
          {isWinner ? 'Victory' : 'Defeat'}
        </div>

        <div className="grid grid-cols-2 gap-12 w-full mt-4">
           <div className="flex flex-col items-center gap-2">
              <img src={player.template.avatar} className="w-32 h-32 rounded-full border-4 border-blue-500 shadow-xl" alt="Player" />
              <span className="font-black text-white text-xl uppercase tracking-widest">{localName}</span>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{player.template.name}</span>
           </div>
           <div className="flex flex-col items-center gap-2">
              <img src={enemy.template.avatar} className="w-32 h-32 rounded-full border-4 border-red-600 shadow-xl" alt="Enemy" />
              <span className="font-black text-white text-xl uppercase tracking-widest">{remoteName || 'Challenger'}</span>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{enemy.template.name}</span>
           </div>
        </div>

        <button 
          onClick={onRestart}
          className="mt-8 px-12 py-4 bg-blue-600 hover:bg-blue-500 text-white text-xl font-black uppercase italic tracking-tighter rounded-full transition-all transform hover:scale-105 shadow-2xl shadow-blue-500/40"
        >
          Return to Arena
        </button>
      </div>
    </div>
  );
};

export default PostMatch;
