import React from 'react';

const LobbyBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#020205]">
      {/* Deep Space */}
      <div className="absolute inset-0 opacity-40">
        {[...Array(80)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white animate-pulse"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 2}px`,
              height: `${Math.random() * 2}px`,
              animationDelay: `${Math.random() * 10}s`,
              animationDuration: `${Math.random() * 5 + 3}s`
            }}
          />
        ))}
      </div>
      
      {/* Zenith Gate Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full border border-[#d4af37]/5 gate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-[#d4af37]/10" />
      
      {/* Rotating Mechanical Ring Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border-t border-b border-[#d4af37]/20 animate-spin" style={{ animationDuration: '40s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] rounded-full border-l border-r border-[#d4af37]/10 animate-spin" style={{ animationDuration: '60s', animationDirection: 'reverse' }} />
      
      {/* Central Nebula Atmosphere */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#d4af37]/5 blur-[100px] rounded-full" />
      
      {/* Peripheral Atmosphere Glows */}
      <div className="absolute -top-[20%] left-[10%] w-[60%] h-[60%] bg-indigo-900/10 blur-[150px] rounded-full" />
      <div className="absolute -bottom-[20%] right-[10%] w-[60%] h-[60%] bg-purple-900/10 blur-[150px] rounded-full" />
    </div>
  );
};

export default LobbyBackground;