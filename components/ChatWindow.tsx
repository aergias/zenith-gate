import React, { useState, useRef, useEffect } from 'react';
import { Message, Player } from '../types';
import { getAiResponse } from '../services/geminiService';

interface ChatWindowProps {
  currentUser: Player;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onAiResponse: (text: string) => void;
  isHost: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ currentUser, messages, onSendMessage, onAiResponse, isHost }) => {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input.trim();
    onSendMessage(userText);
    setInput('');

    if (isHost) {
      setIsTyping(true);
      const aiText = await getAiResponse(userText, messages);
      setIsTyping(false);
      onAiResponse(aiText);
    }
  };

  return (
    <div className="flex flex-col h-full glass rounded-3xl zenith-border overflow-hidden shadow-2xl">
      <div className="px-8 py-5 border-b border-white/5 bg-black/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse" />
          <span className="font-orbitron text-[10px] tracking-[0.3em] text-[#d4af37]">SANCTUM COMMS ARRAY</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 scroll-smooth">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.senderId === currentUser.id ? 'items-end' : 'items-start'}`}>
            <div className="flex items-baseline gap-3 mb-1.5 px-1">
              <span className={`text-[9px] font-bold uppercase tracking-[0.2em] font-orbitron ${msg.isAi ? 'text-[#d4af37]' : 'text-white/40'}`}>
                {msg.senderName}
              </span>
              <span className="text-[8px] text-white/10 font-mono">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className={`max-w-[80%] px-5 py-3 rounded-2xl text-sm leading-relaxed font-inter ${msg.senderId === currentUser.id ? 'bg-[#d4af37]/10 text-white border border-[#d4af37]/20 rounded-tr-none shadow-xl' : msg.isAi ? 'bg-indigo-900/10 text-[#d4af37]/90 border border-[#d4af37]/10 rounded-tl-none font-cinzel tracking-wide italic' : 'bg-white/5 text-white/80 border border-white/5 rounded-tl-none'}`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center gap-2 px-1 text-[#d4af37]/40 italic text-[10px] font-orbitron tracking-widest">
             <div className="flex gap-1">
               <div className="w-1 h-1 bg-[#d4af37] rounded-full animate-bounce" />
               <div className="w-1 h-1 bg-[#d4af37] rounded-full animate-bounce [animation-delay:-0.1s]" />
               <div className="w-1 h-1 bg-[#d4af37] rounded-full animate-bounce [animation-delay:-0.2s]" />
             </div>
             ZENITH OS IS PROCESSING...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-6 bg-black/40 border-t border-white/5">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Whisper to the gate..."
            className="w-full bg-black/40 border border-[#d4af37]/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#d4af37]/30 transition-all pr-14 text-white placeholder-white/20 font-cinzel tracking-wider"
          />
          <button type="submit" disabled={!input.trim()} className="absolute right-3 p-2 text-[#d4af37] hover:scale-110 disabled:opacity-20 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.854 8.325a.5.5 0 0 1 0 .324l-2.854 8.325a.498.498 0 0 0 .683.627l18-9a.5.5 0 0 0 0-.894Z"/><path d="M5 12h14"/></svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatWindow;