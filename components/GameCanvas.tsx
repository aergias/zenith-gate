import React, { useRef, useEffect, useCallback } from 'react';
import { GameState, AbilityKey, Projectile, Entity, Ability, Zone, VFX, StatusType, StatusEffect, Obstacle } from '../types';
import { ARENA_WIDTH, ARENA_HEIGHT } from '../constants';
import { soundService } from '../services/soundService';
import { syncService } from '../services/syncService';

interface Props {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onGameOver: (winner: 'player' | 'enemy' | 'Player1' | 'Player2') => void;
}

const GameCanvas: React.FC<Props> = ({ gameState, setGameState, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(performance.now());
  const mousePosRef = useRef({ x: 0, y: 0 });
  const isGameOverRef = useRef(false);
  
  const aiTickRef = useRef(0);
  const aiLastPosRef = useRef({ x: 0, y: 0, framesStuck: 0 });

  const stateRef = useRef(gameState);
  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  const checkWallCollision = (x: number, y: number, radius: number, obstacles: Obstacle[]) => {
    const r = radius + 1;
    return obstacles.some(o => 
      x + r > o.x && 
      x - r < o.x + o.width && 
      y + r > o.y && 
      y - r < o.y + o.height
    );
  };

  const applyDamage = (ent: Entity, amount: number, vfx: VFX[]): Entity => {
    if (ent.stats.hp <= 0) return ent;
    
    const newEnt = { ...ent, stats: { ...ent.stats }, buffs: [...ent.buffs] };
    const shieldIndex = newEnt.buffs.findIndex(b => b.type === StatusType.SHIELD);
    
    if (shieldIndex !== -1) {
      const shield = { ...newEnt.buffs[shieldIndex] };
      const shieldVal = shield.value || 0;
      if (shieldVal >= amount) {
        shield.value = shieldVal - amount;
        newEnt.buffs[shieldIndex] = shield;
        vfx.push({ id: Math.random().toString(), x: ent.x, y: ent.y, type: 'impact', color: '#FFD700', radius: 40, timer: 200, maxTimer: 200 });
        soundService.playImpact();
        return newEnt;
      } else {
        const remaining = amount - shieldVal;
        newEnt.buffs.splice(shieldIndex, 1);
        newEnt.stats.hp -= remaining;
        soundService.playImpact();
        vfx.push({ id: Math.random().toString(), x: ent.x, y: ent.y, type: 'shatter', color: '#FFD700', radius: 70, timer: 500, maxTimer: 500 });
      }
    } else {
      newEnt.stats.hp -= amount;
      soundService.playImpact();
    }
    return newEnt;
  };

  const applyStatus = (ent: Entity, effect: StatusEffect): Entity => {
    if (ent.stats.hp <= 0) return ent;
    soundService.playStatusApply();
    const newEnt = { ...ent, buffs: [...ent.buffs] };
    const existingIndex = newEnt.buffs.findIndex(b => b.type === effect.type);
    
    if (existingIndex !== -1) {
      const existing = { ...newEnt.buffs[existingIndex] };
      existing.timer = Math.max(existing.timer, effect.timer);
      if (effect.type === StatusType.SHIELD) {
        existing.value = (existing.value || 0) + (effect.value || 0);
      } else {
        existing.value = effect.value;
      }
      newEnt.buffs[existingIndex] = existing;
    } else {
      newEnt.buffs.push({ ...effect });
    }
    return newEnt;
  };

  const castAbility = useCallback((ownerId: 'player' | 'enemy', abilityId: AbilityKey, tx: number, ty: number, fromSync: boolean = false) => {
    const current = stateRef.current;
    if (current.phase !== 'battle' || current.countdown > 0 || current.isPaused || isGameOverRef.current) return;
    
    const owner = ownerId === 'player' ? current.player : current.enemy;
    if (!owner || owner.stats.hp <= 0 || owner.buffs.some(b => b.type === StatusType.STUN)) return;
    
    const ability = owner.template.abilities.find(a => a.id === abilityId);
    if (!ability || ability.currentCooldown > 0 || owner.stats.mana < ability.manaCost) return;
    
    setGameState(prev => {
      if (!prev.player || !prev.enemy) return prev;
      
      const isPlayer = ownerId === 'player';
      let caster = isPlayer ? { ...prev.player } : { ...prev.enemy };
      let target = isPlayer ? { ...prev.enemy } : { ...prev.player };
      const newVFX = [...prev.vfx];
      const newProjectiles = [...prev.projectiles];
      const newZones = [...prev.zones];

      caster.stats = { ...caster.stats, mana: caster.stats.mana - ability.manaCost };
      const abs = caster.template.abilities.map(a => a.id === abilityId ? { ...a, currentCooldown: a.cooldown } : a);
      caster.template = { ...caster.template, abilities: abs };

      if (caster.template.id === 'kratos') soundService.playThunder();
      else if (caster.template.id === 'lyra') soundService.playCrystal();
      else if (caster.template.id === 'vesper') soundService.playVoid();
      else if (caster.template.modelType === 'mage') soundService.playFire();
      else if (caster.template.modelType === 'ranger') soundService.playVoid();
      else soundService.playEarth();

      if (ability.type === 'projectile') {
        const angle = Math.atan2(ty - caster.y, tx - caster.x);
        const speed = ability.speed || 1400;
        newProjectiles.push({
          id: Math.random().toString(),
          x: caster.x + Math.cos(angle) * (caster.radius + 10),
          y: caster.y + Math.sin(angle) * (caster.radius + 10),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 12,
          damage: ability.damage,
          ownerId: caster.id,
          color: ability.color,
          life: (ability.range || 1000) / speed,
          effect: ability.effect
        });
      } else if (ability.type === 'aoe') {
        soundService.playExplosion(ability.id === AbilityKey.F);
        newVFX.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'ring', color: ability.color, radius: ability.radius || 100, timer: 400, maxTimer: 400 });
        const dist = Math.sqrt((target.x - caster.x) ** 2 + (target.y - caster.y) ** 2);
        if (dist < (ability.radius || 100) + target.radius) {
          target = applyDamage(target, ability.damage, newVFX);
          if (ability.effect) target = applyStatus(target, ability.effect);
        }
      } else if (ability.type === 'dash') {
        soundService.playDash();
        const angle = Math.atan2(ty - caster.y, tx - caster.x);
        const range = ability.range || 300;
        let finalX = caster.x + Math.cos(angle) * range;
        let finalY = caster.y + Math.sin(angle) * range;

        const steps = 20;
        for (let i = steps; i >= 0; i--) {
          const testX = caster.x + Math.cos(angle) * (range * (i / steps));
          const testY = caster.y + Math.sin(angle) * (range * (i / steps));
          const hit = checkWallCollision(testX, testY, caster.radius, prev.obstacles);
          const outOfBounds = testX < caster.radius || testX > ARENA_WIDTH - caster.radius || testY < caster.radius || testY > ARENA_HEIGHT - caster.radius;
          if (!hit && !outOfBounds) { finalX = testX; finalY = testY; break; }
        }
        
        caster.x = finalX; caster.y = finalY;
        caster.targetX = finalX; caster.targetY = finalY;
        newVFX.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'shockwave', color: ability.color, radius: 120, timer: 300, maxTimer: 300 });
      } else if (ability.type === 'self-buff') {
        newVFX.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'ring', color: ability.color, radius: caster.radius * 2, timer: 300, maxTimer: 300 });
        if (ability.effect) caster = applyStatus(caster, ability.effect);
      } else if (ability.type === 'target-delayed') {
        newZones.push({
          id: Math.random().toString(), x: tx, y: ty, radius: ability.radius || 140, timer: 800, maxTimer: 800, damage: ability.damage, ownerId: caster.id, color: ability.color, effect: ability.effect
        });
      }

      return { ...prev, player: isPlayer ? caster : target, enemy: isPlayer ? target : caster, vfx: newVFX, projectiles: newProjectiles, zones: newZones };
    });
  }, [setGameState]);

  const update = useCallback((time: number) => {
    if (isGameOverRef.current) return;
    const realDt = time - lastUpdateRef.current;
    const dt = Math.min(realDt, 50);
    lastUpdateRef.current = time;
    const dtSeconds = dt / 1000;

    setGameState(prev => {
      if (prev.phase !== 'battle' || prev.isPaused) return prev;
      if (prev.countdown > 0) return { ...prev, countdown: Math.max(0, prev.countdown - dt) };

      let player = { ...prev.player! };
      let enemy = { ...prev.enemy! };
      let projectiles = [...prev.projectiles];
      let zones = [...prev.zones];
      let vfx = [...prev.vfx];

      vfx = vfx.filter(v => { v.timer -= dt; return v.timer > 0; });

      // AI Logic
      aiTickRef.current++;
      if (prev.gameMode === 'SOLO' && enemy.stats.hp > 0 && !enemy.buffs.some(b => b.type === StatusType.STUN)) {
        const dx = player.x - enemy.x, dy = player.y - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const isMelee = enemy.template.modelType === 'warrior' || enemy.template.modelType === 'assassin';
        const optimalDist = isMelee ? 90 : 450;
        const MARGIN = 100;

        if (aiTickRef.current % 30 === 0) {
          if (dist > optimalDist + 50) {
            enemy.targetX = Math.max(MARGIN, Math.min(ARENA_WIDTH - MARGIN, player.x));
            enemy.targetY = Math.max(MARGIN, Math.min(ARENA_HEIGHT - MARGIN, player.y));
          } else if (dist < optimalDist - 50) {
            const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
            enemy.targetX = Math.max(MARGIN, Math.min(ARENA_WIDTH - MARGIN, enemy.x + Math.cos(angle) * 200));
            enemy.targetY = Math.max(MARGIN, Math.min(ARENA_HEIGHT - MARGIN, enemy.y + Math.sin(angle) * 200));
          }
        }

        if (aiTickRef.current % 45 === 0) {
          const readyAbility = enemy.template.abilities.find(a => a.currentCooldown <= 0 && enemy.stats.mana >= a.manaCost);
          if (readyAbility && dist < (readyAbility.range || 800) && Math.random() < 0.3) {
            castAbility('enemy', readyAbility.id, player.x, player.y);
          }
        }
      }

      // Movement & Stats
      [player, enemy].forEach((ent, idx) => {
        if (!ent || ent.stats.hp <= 0) return;
        const isStunned = ent.buffs.some(b => b.type === StatusType.STUN);
        
        ent.stats = { ...ent.stats };
        ent.stats.mana = Math.min(ent.stats.maxMana, ent.stats.mana + ent.stats.manaRegen * dtSeconds);
        
        const abilities = ent.template.abilities.map(a => ({ ...a, currentCooldown: Math.max(0, a.currentCooldown - dt) }));
        ent.template = { ...ent.template, abilities };

        let speed = ent.stats.speed;
        ent.buffs = ent.buffs.filter(b => {
          b.timer -= dt;
          if (b.type === StatusType.SLOW) speed *= (1 - (b.value || 0));
          if (b.type === StatusType.SPEED) speed += (b.value || 0);
          if (b.type === StatusType.BURN) {
             const dmg = (b.value || 0) * dtSeconds;
             if (idx === 0) player.stats.hp -= dmg; else enemy.stats.hp -= dmg;
          }
          return b.timer > 0;
        });

        if (!isStunned) {
          const dx = ent.targetX - ent.x, dy = ent.targetY - ent.y, d = Math.sqrt(dx*dx + dy*dy);
          if (d > 5) {
            ent.state = 'moving';
            const targetAngle = Math.atan2(dy, dx);
            let angleDiff = targetAngle - ent.angle;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            ent.angle += angleDiff * Math.min(1, 40 * dtSeconds); 

            const moveStep = speed * dtSeconds;
            const vx = Math.cos(targetAngle) * Math.min(d, moveStep);
            const vy = Math.sin(targetAngle) * Math.min(d, moveStep);

            const nextX = ent.x + vx, nextY = ent.y + vy;
            if (!checkWallCollision(nextX, ent.y, ent.radius, prev.obstacles)) {
              ent.x = Math.max(ent.radius, Math.min(ARENA_WIDTH - ent.radius, nextX));
            }
            if (!checkWallCollision(ent.x, nextY, ent.radius, prev.obstacles)) {
              ent.y = Math.max(ent.radius, Math.min(ARENA_HEIGHT - ent.radius, nextY));
            }
          } else { ent.state = 'idle'; }

          // Overhauled Basic Attacks
          const other = idx === 0 ? enemy : player;
          const distToOther = Math.sqrt((other.x - ent.x)**2 + (other.y - ent.y)**2);
          
          if (other.stats.hp > 0 && distToOther < ent.stats.attackRange && ent.attackTimer <= 0) {
            const isRanged = ent.template.modelType === 'ranger' || ent.template.modelType === 'mage';
            
            if (isRanged) {
              // Fire basic projectile - Color matched to character
              const angle = Math.atan2(other.y - ent.y, other.x - ent.x);
              projectiles.push({
                id: Math.random().toString(),
                x: ent.x + Math.cos(angle) * (ent.radius + 5),
                y: ent.y + Math.sin(angle) * (ent.radius + 5),
                vx: Math.cos(angle) * 1200,
                vy: Math.sin(angle) * 1200,
                radius: 6,
                damage: ent.stats.baseAttackDamage,
                ownerId: ent.id,
                color: ent.template.color || '#ffffff',
                life: ent.stats.attackRange / 1200
              });
              ent.attackTimer = 1000 / ent.stats.attackSpeed;
              soundService.playProjectile();
            } else {
              // Melee: Check facing angle to avoid 'backwards' hits
              const angleToTarget = Math.atan2(other.y - ent.y, other.x - ent.x);
              let angleDiff = angleToTarget - ent.angle;
              while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
              while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

              if (Math.abs(angleDiff) < Math.PI / 4) { // 45 degree cone
                const res = applyDamage(other, ent.stats.baseAttackDamage, vfx);
                if (idx === 0) enemy = res; else player = res;
                ent.attackTimer = 1000 / ent.stats.attackSpeed;
              }
            }
          }
        } else { ent.state = 'idle'; }
        ent.attackTimer = Math.max(0, ent.attackTimer - dt);
      });

      projectiles.forEach(p => {
        p.x += p.vx * dtSeconds; p.y += p.vy * dtSeconds; p.life -= dtSeconds;
        const target = p.ownerId === 'player' ? enemy : player;
        const dist = Math.sqrt((p.x - target.x)**2 + (p.y - target.y)**2);
        if (dist < p.radius + target.radius && target.stats.hp > 0) {
          const res = applyDamage(target, p.damage, vfx);
          if (p.ownerId === 'player') enemy = res; else player = res;
          if (p.effect) {
             const resStatus = applyStatus(p.ownerId === 'player' ? enemy : player, p.effect);
             if (p.ownerId === 'player') enemy = resStatus; else player = resStatus;
          }
          p.life = 0;
        }
        if (checkWallCollision(p.x, p.y, p.radius, prev.obstacles)) {
          vfx.push({ id: Math.random().toString(), x: p.x, y: p.y, type: 'wall-hit', color: p.color, radius: 20, timer: 150, maxTimer: 150 });
          p.life = 0;
        }
      });
      projectiles = projectiles.filter(p => p.life > 0);

      zones.forEach(z => {
        z.timer -= dt;
        if (z.timer <= 0) {
          const target = z.ownerId === 'player' ? enemy : player;
          const dist = Math.sqrt((z.x - target.x)**2 + (z.y - target.y)**2);
          if (dist < z.radius + target.radius) {
            const res = applyDamage(target, z.damage, vfx);
            if (z.ownerId === 'player') enemy = res; else player = res;
            if (z.effect) {
               const resStatus = applyStatus(z.ownerId === 'player' ? enemy : player, z.effect);
               if (z.ownerId === 'player') enemy = resStatus; else player = resStatus;
            }
          }
          vfx.push({ id: Math.random().toString(), x: z.x, y: z.y, type: 'explosion', color: z.color, radius: z.radius, timer: 500, maxTimer: 500 });
        }
      });
      zones = zones.filter(z => z.timer > 0);

      if (!isGameOverRef.current) {
        if (player.stats.hp <= 0) { isGameOverRef.current = true; onGameOver('enemy'); }
        else if (enemy.stats.hp <= 0) { isGameOverRef.current = true; onGameOver('player'); }
      }
      return { ...prev, player, enemy, projectiles, zones, vfx };
    });
    requestRef.current = requestAnimationFrame(update);
  }, [setGameState, onGameOver, castAbility]);

  useEffect(() => {
    isGameOverRef.current = false;
    lastUpdateRef.current = performance.now();
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 2 || isGameOverRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (ARENA_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (ARENA_HEIGHT / rect.height);
      setGameState(prev => ({ ...prev, player: prev.player ? { ...prev.player, targetX: x, targetY: y } : null }));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const keys: Record<string, AbilityKey> = { 'a': AbilityKey.A, 's': AbilityKey.S, 'd': AbilityKey.D, 'f': AbilityKey.F };
      const abilityId = keys[e.key.toLowerCase()];
      if (abilityId) castAbility('player', abilityId, mousePosRef.current.x, mousePosRef.current.y);
    };
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mousePosRef.current = { x: (e.clientX - rect.left) * (ARENA_WIDTH / rect.width), y: (e.clientY - rect.top) * (ARENA_HEIGHT / rect.height) };
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [setGameState, castAbility]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const render = () => {
      const s = stateRef.current;
      ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
      for(let x=0; x<ARENA_WIDTH; x+=100) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x, ARENA_HEIGHT); ctx.stroke(); }
      for(let y=0; y<ARENA_HEIGHT; y+=100) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(ARENA_WIDTH, y); ctx.stroke(); }
      s.obstacles.forEach(o => { ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.fillRect(o.x, o.y, o.width, o.height); ctx.strokeRect(o.x, o.y, o.width, o.height); });
      s.zones.forEach(z => { ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fillStyle = z.color + '22'; ctx.fill(); ctx.strokeStyle = z.color; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); });
      s.projectiles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.shadowBlur = 10; ctx.shadowColor = p.color; ctx.fill(); ctx.shadowBlur = 0; });
      [s.player, s.enemy].forEach(ent => {
        if (!ent || ent.stats.hp <= 0) return;
        const shield = ent.buffs.find(b => b.type === StatusType.SHIELD);
        if (shield) {
          ctx.save();
          const pulse = Math.sin(Date.now() / 150) * 0.15 + 0.6;
          ctx.globalAlpha = pulse;
          ctx.beginPath(); ctx.arc(ent.x, ent.y, ent.radius * 1.6, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(ent.x, ent.y, ent.radius * 0.8, ent.x, ent.y, ent.radius * 1.6);
          grad.addColorStop(0, 'rgba(255, 215, 0, 0)'); grad.addColorStop(0.8, 'rgba(255, 215, 0, 0.4)'); grad.addColorStop(1, 'rgba(255, 215, 0, 0.8)');
          ctx.fillStyle = grad; ctx.fill(); ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.setLineDash([10, 5]); ctx.lineDashOffset = Date.now() / 30; ctx.stroke();
          ctx.restore();
        }
        ctx.save(); ctx.translate(ent.x, ent.y); ctx.rotate(ent.angle); ctx.beginPath(); ctx.arc(0, 0, ent.radius, 0, Math.PI * 2); ctx.fillStyle = ent.template.color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ent.radius - 5, -8); ctx.lineTo(ent.radius + 10, 0); ctx.lineTo(ent.radius - 5, 8); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
      });
      s.vfx.forEach(v => {
        const progress = 1 - (v.timer / v.maxTimer); ctx.globalAlpha = 1 - progress; ctx.beginPath();
        if (v.type === 'ring' || v.type === 'shockwave') { ctx.arc(v.x, v.y, v.radius * progress, 0, Math.PI * 2); ctx.strokeStyle = v.color; ctx.lineWidth = 3; ctx.stroke(); }
        else if (v.type === 'explosion') { ctx.arc(v.x, v.y, v.radius * progress, 0, Math.PI * 2); ctx.fillStyle = v.color; ctx.fill(); }
        else if (v.type === 'impact' || v.type === 'wall-hit' || v.type === 'shatter') { ctx.arc(v.x, v.y, v.radius * (1 - progress), 0, Math.PI * 2); ctx.fillStyle = v.color; ctx.fill(); }
        else if (v.type === 'lightning') { 
          ctx.moveTo(v.x, v.y);
          ctx.lineTo(v.x + (Math.random()-0.5)*v.radius, v.y + (Math.random()-0.5)*v.radius);
          ctx.strokeStyle = v.color; ctx.stroke(); 
        }
      });
      ctx.globalAlpha = 1.0; requestAnimationFrame(render);
    };
    const animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} width={ARENA_WIDTH} height={ARENA_HEIGHT} className="bg-slate-900 border-2 border-slate-800 rounded-3xl shadow-2xl cursor-crosshair block mx-auto" onContextMenu={(e) => e.preventDefault()} />;
};

export default GameCanvas;