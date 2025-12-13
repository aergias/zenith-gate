
import React, { useRef, useEffect, useCallback } from 'react';
import { GameState, AbilityKey, Projectile, Entity, Zone, VFX, StatusType, StatusEffect, Obstacle, Ability } from '../types';
import { ARENA_WIDTH, ARENA_HEIGHT } from '../constants';
import { soundService } from '../services/soundService';

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
  
  // High-performance Simulation Ref (Bypasses React State for calculation)
  const simRef = useRef<GameState>(gameState);
  
  // AI Tactical State
  const aiTickRef = useRef(0);
  const aiStateRef = useRef<'NEUTRAL' | 'AGGRESSIVE' | 'DEFENSIVE' | 'PANIC' | 'EVADE'>('NEUTRAL');
  const aiDodgeDirRef = useRef({ x: 0, y: 0 });
  const aiReactionTicksRef = useRef(0);

  // Sync React state to Simulation Ref for external changes (like character selection/reset)
  useEffect(() => {
    simRef.current = gameState;
  }, [gameState.phase, gameState.player?.template.id, gameState.enemy?.template.id]);

  const checkWallCollision = (x: number, y: number, radius: number, obstacles: Obstacle[]) => {
    const r = radius + 2;
    if (x < r || x > ARENA_WIDTH - r || y < r || y > ARENA_HEIGHT - r) return true;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (x + r > o.x && x - r < o.x + o.width && y + r > o.y && y - r < o.y + o.height) return true;
    }
    return false;
  };

  const applyDamage = (ent: Entity, amount: number, vfx: VFX[]): Entity => {
    if (ent.stats.hp <= 0) return ent;
    const shieldIndex = ent.buffs.findIndex(b => b.type === StatusType.SHIELD);
    if (shieldIndex !== -1) {
      const shield = ent.buffs[shieldIndex];
      const shieldVal = shield.value || 0;
      if (shieldVal >= amount) {
        shield.value = shieldVal - amount;
        vfx.push({ id: Math.random().toString(), x: ent.x, y: ent.y, type: 'impact', color: '#FFD700', radius: 40, timer: 200, maxTimer: 200 });
        soundService.playImpact();
        return ent;
      } else {
        const remaining = amount - shieldVal;
        ent.buffs.splice(shieldIndex, 1);
        ent.stats.hp -= remaining;
        soundService.playImpact();
        vfx.push({ id: Math.random().toString(), x: ent.x, y: ent.y, type: 'shatter', color: '#FFD700', radius: 70, timer: 500, maxTimer: 500 });
      }
    } else {
      ent.stats.hp -= amount;
      soundService.playImpact();
    }
    return ent;
  };

  const applyStatus = (ent: Entity, effect: StatusEffect): Entity => {
    if (ent.stats.hp <= 0) return ent;
    soundService.playStatusApply();
    const existingIndex = ent.buffs.findIndex(b => b.type === effect.type);
    if (existingIndex !== -1) {
      const existing = ent.buffs[existingIndex];
      existing.timer = Math.max(existing.timer, effect.timer);
      if (effect.type === StatusType.SHIELD) existing.value = (existing.value || 0) + (effect.value || 0);
      else existing.value = effect.value;
    } else {
      ent.buffs.push({ ...effect });
    }
    return ent;
  };

  const castAbility = useCallback((ownerId: 'player' | 'enemy', abilityId: AbilityKey, tx: number, ty: number) => {
    const s = simRef.current;
    if (s.phase !== 'battle' || s.countdown > 0 || s.isPaused || isGameOverRef.current) return;
    
    const caster = ownerId === 'player' ? s.player : s.enemy;
    const target = ownerId === 'player' ? s.enemy : s.player;
    if (!caster || !target || caster.stats.hp <= 0 || caster.buffs.some(b => b.type === StatusType.STUN)) return;
    
    const ability = caster.template.abilities.find(a => a.id === abilityId);
    if (!ability || ability.currentCooldown > 0 || caster.stats.mana < ability.manaCost) return;

    caster.stats.mana -= ability.manaCost;
    ability.currentCooldown = ability.cooldown;

    // Dispatch Sound
    if (caster.template.id === 'kratos') soundService.playThunder();
    else if (caster.template.id === 'lyra') soundService.playCrystal();
    else if (caster.template.id === 'vesper') soundService.playVoid();
    else if (caster.template.modelType === 'mage') soundService.playFire();
    else if (caster.template.modelType === 'ranger') soundService.playVoid();
    else soundService.playEarth();

    if (ability.type === 'projectile') {
      const angle = Math.atan2(ty - caster.y, tx - caster.x);
      const speed = ability.speed || 1400;
      s.projectiles.push({
        id: Math.random().toString(),
        x: caster.x + Math.cos(angle) * (caster.radius + 15),
        y: caster.y + Math.sin(angle) * (caster.radius + 15),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 12, damage: ability.damage, ownerId: caster.id,
        color: ability.color, life: (ability.range || 1000) / speed, effect: ability.effect
      });
    } else if (ability.type === 'aoe') {
      soundService.playExplosion(ability.id === AbilityKey.F);
      s.vfx.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'ring', color: ability.color, radius: ability.radius || 100, timer: 400, maxTimer: 400 });
      const dist = Math.hypot(target.x - caster.x, target.y - caster.y);
      if (dist < (ability.radius || 100) + target.radius) {
        applyDamage(target, ability.damage, s.vfx);
        if (ability.effect) applyStatus(target, ability.effect);
      }
    } else if (ability.type === 'dash') {
      soundService.playDash();
      const angle = Math.atan2(ty - caster.y, tx - caster.x);
      const range = ability.range || 300;
      const steps = 10;
      for (let i = steps; i >= 0; i--) {
        const tx_ = caster.x + Math.cos(angle) * (range * (i / steps));
        const ty_ = caster.y + Math.sin(angle) * (range * (i / steps));
        if (!checkWallCollision(tx_, ty_, caster.radius, s.obstacles)) {
          caster.x = tx_; caster.y = ty_; caster.targetX = tx_; caster.targetY = ty_;
          break;
        }
      }
      s.vfx.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'shockwave', color: ability.color, radius: 120, timer: 300, maxTimer: 300 });
    } else if (ability.type === 'self-buff') {
      s.vfx.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'ring', color: ability.color, radius: caster.radius * 2, timer: 300, maxTimer: 300 });
      // Fixed: Using ability.effect instead of undefined variable 'effect'
      if (ability.effect) applyStatus(caster, ability.effect);
    } else if (ability.type === 'target-delayed') {
      s.zones.push({
        id: Math.random().toString(), x: tx, y: ty, radius: ability.radius || 140, timer: 800, maxTimer: 800, damage: ability.damage, ownerId: caster.id, color: ability.color, effect: ability.effect
      });
    }
  }, []);

  const gameLoop = useCallback((time: number) => {
    if (isGameOverRef.current) return;
    const dt = Math.min(time - lastUpdateRef.current, 50);
    lastUpdateRef.current = time;
    const dtSec = dt / 1000;

    const s = simRef.current;
    if (s.phase === 'battle' && !s.isPaused) {
      if (s.countdown > 0) {
        s.countdown = Math.max(0, s.countdown - dt);
      } else {
        const { player, enemy, projectiles, zones, vfx, obstacles } = s;
        if (!player || !enemy) return;

        // 1. Process VFX
        for (let i = vfx.length - 1; i >= 0; i--) {
          vfx[i].timer -= dt;
          if (vfx[i].timer <= 0) vfx.splice(i, 1);
        }

        // 2. Advanced AI Logic
        if (s.gameMode === 'SOLO' && enemy.stats.hp > 0 && !enemy.buffs.some(b => b.type === StatusType.STUN)) {
          aiTickRef.current++;
          
          // Throttled decision making
          if (aiTickRef.current % 2 === 0) { 
            const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            const isMelee = enemy.template.modelType === 'warrior' || enemy.template.modelType === 'assassin';
            const healthRatio = enemy.stats.hp / enemy.stats.maxHp;
            const playerHealthRatio = player.stats.hp / player.stats.maxHp;

            // 2a. Determine Tactical State
            if (healthRatio < 0.2) aiStateRef.current = 'PANIC';
            else if (playerHealthRatio < 0.3 || (healthRatio > 0.7 && playerHealthRatio < 0.6)) aiStateRef.current = 'AGGRESSIVE';
            else if (healthRatio < 0.5) aiStateRef.current = 'DEFENSIVE';
            else aiStateRef.current = 'NEUTRAL';

            // 2b. Reactive Dodging (High Priority)
            const threateningProjectile = projectiles.find(p => {
              if (p.ownerId === 'enemy') return false;
              const dToP = Math.hypot(p.x - enemy.x, p.y - enemy.y);
              if (dToP > 300) return false;
              const dot = (p.vx * (enemy.x - p.x) + p.vy * (enemy.y - p.y));
              return dot > 0;
            });

            if (threateningProjectile) {
              const perpX = -threateningProjectile.vy, perpY = threateningProjectile.vx;
              const mag = Math.hypot(perpX, perpY);
              const side = (enemy.x - threateningProjectile.x) * threateningProjectile.vy - (enemy.y - threateningProjectile.y) * threateningProjectile.vx > 0 ? 1 : -1;
              aiDodgeDirRef.current = { x: (perpX / mag) * side, y: (perpY / mag) * side };
              aiReactionTicksRef.current = 15;
              enemy.targetX = enemy.x + aiDodgeDirRef.current.x * 150;
              enemy.targetY = enemy.y + aiDodgeDirRef.current.y * 150;
            } else if (aiReactionTicksRef.current > 0) {
              aiReactionTicksRef.current--;
            } else {
              // 2c. Strategic Movement
              if (aiTickRef.current % 10 === 0) {
                if (aiStateRef.current === 'AGGRESSIVE' || (isMelee && aiStateRef.current !== 'PANIC')) {
                  enemy.targetX = player.x;
                  enemy.targetY = player.y;
                } else if (aiStateRef.current === 'PANIC' || aiStateRef.current === 'DEFENSIVE') {
                  const angleToPlayer = Math.atan2(enemy.y - player.y, enemy.x - player.x);
                  const escapeAngle = angleToPlayer + (Math.random() - 0.5) * 0.5;
                  enemy.targetX = enemy.x + Math.cos(escapeAngle) * 300;
                  enemy.targetY = enemy.y + Math.sin(escapeAngle) * 300;
                } else {
                  const idealDist = 400;
                  if (dist < idealDist - 50) {
                    const ang = Math.atan2(enemy.y - player.y, enemy.x - player.x);
                    enemy.targetX = enemy.x + Math.cos(ang) * 150; enemy.targetY = enemy.y + Math.sin(ang) * 150;
                  } else if (dist > idealDist + 50) {
                    enemy.targetX = player.x; enemy.targetY = player.y;
                  }
                }
              }
            }

            // 2d. Sophisticated Ability Usage
            if (aiTickRef.current % 8 === 0) {
              const abilities = enemy.template.abilities;
              const isPlayerStunned = player.buffs.some(b => b.type === StatusType.STUN);
              
              // Priority: Survival
              const defensive = abilities.find(a => a.effect?.type === StatusType.SHIELD && a.currentCooldown <= 0 && enemy.stats.mana >= a.manaCost);
              if (defensive && (threateningProjectile || healthRatio < 0.4)) castAbility('enemy', defensive.id, 0, 0);

              // Priority: Stuns/CC
              const cc = abilities.find(a => (a.effect?.type === StatusType.STUN || a.effect?.type === StatusType.SLOW) && a.currentCooldown <= 0 && enemy.stats.mana >= a.manaCost);
              if (cc && dist < (cc.range || 600) && !isPlayerStunned) castAbility('enemy', cc.id, player.x, player.y);

              // Priority: High-Impact / Ult
              const ult = abilities.find(a => a.id === AbilityKey.F && a.currentCooldown <= 0 && enemy.stats.mana >= a.manaCost);
              if (ult && (playerHealthRatio < 0.3 || isPlayerStunned)) {
                castAbility('enemy', ult.id, player.x, player.y);
              }

              // Priority: Standard Offense (Lead shots)
              const poke = abilities.find(a => (a.id === AbilityKey.A || a.id === AbilityKey.D) && a.currentCooldown <= 0 && enemy.stats.mana >= a.manaCost);
              if (poke && dist < (poke.range || 800)) {
                // Predictive aim: aim where player is likely to be
                const lead = 0.3;
                const tx = player.x + (player.targetX - player.x) * lead;
                const ty = player.y + (player.targetY - player.y) * lead;
                castAbility('enemy', poke.id, tx, ty);
              }
            }
          }
        }

        // 3. Movement & Physics
        [player, enemy].forEach((ent, idx) => {
          if (ent.stats.hp <= 0) return;
          ent.stats.mana = Math.min(ent.stats.maxMana, ent.stats.mana + ent.stats.manaRegen * dtSec);
          ent.template.abilities.forEach(a => a.currentCooldown = Math.max(0, a.currentCooldown - dt));
          
          let speed = ent.stats.speed;
          for (let i = ent.buffs.length - 1; i >= 0; i--) {
            const b = ent.buffs[i];
            b.timer -= dt;
            if (b.type === StatusType.SLOW) speed *= (1 - (b.value || 0.3));
            if (b.type === StatusType.SPEED) speed += (b.value || 0);
            if (b.timer <= 0) ent.buffs.splice(i, 1);
          }

          if (!ent.buffs.some(b => b.type === StatusType.STUN)) {
            const dx = ent.targetX - ent.x, dy = ent.targetY - ent.y, d = Math.hypot(dx, dy);
            if (d > 5) {
              const ang = Math.atan2(dy, dx);
              ent.angle = ang;
              const step = speed * dtSec;
              const vx = Math.cos(ang) * Math.min(d, step);
              const vy = Math.sin(ang) * Math.min(d, step);
              if (!checkWallCollision(ent.x + vx, ent.y, ent.radius, obstacles)) ent.x += vx;
              if (!checkWallCollision(ent.x, ent.y + vy, ent.radius, obstacles)) ent.y += vy;
              ent.state = 'moving';
            } else { ent.state = 'idle'; }

            const other = idx === 0 ? enemy : player;
            if (other.stats.hp > 0 && Math.hypot(other.x - ent.x, other.y - ent.y) < ent.stats.attackRange && ent.attackTimer <= 0) {
              if (ent.template.modelType === 'ranger' || ent.template.modelType === 'mage') {
                const ang = Math.atan2(other.y - ent.y, other.x - ent.x);
                projectiles.push({
                  id: Math.random().toString(), x: ent.x, y: ent.y, vx: Math.cos(ang) * 1200, vy: Math.sin(ang) * 1200,
                  radius: 6, damage: ent.stats.baseAttackDamage, ownerId: ent.id, color: ent.template.color, life: ent.stats.attackRange / 1200
                });
                soundService.playProjectile();
              } else { applyDamage(other, ent.stats.baseAttackDamage, vfx); }
              ent.attackTimer = 1000 / ent.stats.attackSpeed;
            }
          } else { ent.state = 'idle'; }
          ent.attackTimer = Math.max(0, ent.attackTimer - dt);
        });

        // 4. Projectiles & Zones
        for (let i = projectiles.length - 1; i >= 0; i--) {
          const p = projectiles[i];
          p.x += p.vx * dtSec; p.y += p.vy * dtSec; p.life -= dtSec;
          const target = p.ownerId === 'player' ? enemy : player;
          if (Math.hypot(p.x - target.x, p.y - target.y) < p.radius + target.radius) {
            applyDamage(target, p.damage, vfx);
            if (p.effect) applyStatus(target, p.effect);
            p.life = 0;
          }
          if (p.life <= 0 || checkWallCollision(p.x, p.y, p.radius, obstacles)) projectiles.splice(i, 1);
        }

        for (let i = zones.length - 1; i >= 0; i--) {
          const z = zones[i];
          z.timer -= dt;
          if (z.timer <= 0) {
            const target = z.ownerId === 'player' ? enemy : player;
            if (Math.hypot(z.x - target.x, z.y - target.y) < z.radius + target.radius) {
              applyDamage(target, z.damage, vfx);
              if (z.effect) applyStatus(target, z.effect);
            }
            vfx.push({ id: Math.random().toString(), x: z.x, y: z.y, type: 'explosion', color: z.color, radius: z.radius, timer: 400, maxTimer: 400 });
            zones.splice(i, 1);
          }
        }

        // 5. Victory Conditions
        if (player.stats.hp <= 0) onGameOver('enemy');
        else if (enemy.stats.hp <= 0) onGameOver('player');
      }
    }

    // 6. UI Batch Update (Throttled for performance)
    if (aiTickRef.current % 2 === 0) {
      setGameState({ ...simRef.current });
    }

    // 7. High-performance Rendering
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      const s = simRef.current;
      ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
      
      // Arena Grid
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
      for (let x = 0; x < ARENA_WIDTH; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT); ctx.stroke(); }
      for (let y = 0; y < ARENA_HEIGHT; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y); ctx.stroke(); }
      
      // Obstacles
      s.obstacles.forEach(o => { 
        ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; 
        ctx.fillRect(o.x, o.y, o.width, o.height); ctx.strokeRect(o.x, o.y, o.width, o.height); 
      });

      // Ability Zones
      s.zones.forEach(z => { 
        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); 
        ctx.fillStyle = z.color + '15'; ctx.fill(); 
        ctx.strokeStyle = z.color; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); 
      });

      // Projectiles
      s.projectiles.forEach(p => { 
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); 
        ctx.fillStyle = p.color; ctx.shadowBlur = 10; ctx.shadowColor = p.color; ctx.fill(); ctx.shadowBlur = 0;
      });

      // Combatants
      [s.player, s.enemy].forEach(ent => {
        if (!ent || ent.stats.hp <= 0) return;
        
        // Status: Shield
        const shield = ent.buffs.find(b => b.type === StatusType.SHIELD);
        if (shield) {
          ctx.beginPath(); ctx.arc(ent.x, ent.y, ent.radius * 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3; ctx.setLineDash([10, 5]); ctx.lineDashOffset = time / 20; ctx.stroke(); ctx.setLineDash([]);
        }

        // Status: Stunned
        const stunned = ent.buffs.find(b => b.type === StatusType.STUN);
        if (stunned) {
          ctx.beginPath(); ctx.arc(ent.x, ent.y - 40, 10, 0, Math.PI * 2);
          ctx.fillStyle = '#ffcc00'; ctx.fill();
        }

        ctx.save(); ctx.translate(ent.x, ent.y); ctx.rotate(ent.angle);
        ctx.beginPath(); ctx.arc(0, 0, ent.radius, 0, Math.PI * 2); ctx.fillStyle = ent.template.color; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        
        // Forward indicator
        ctx.beginPath(); ctx.moveTo(ent.radius, 0); ctx.lineTo(ent.radius + 15, 0); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
        ctx.restore();
      });

      // Visual Effects
      s.vfx.forEach(v => {
        const p = 1 - (v.timer / v.maxTimer); ctx.globalAlpha = 1 - p;
        if (v.type === 'ring' || v.type === 'shockwave') { ctx.beginPath(); ctx.arc(v.x, v.y, v.radius * p, 0, Math.PI * 2); ctx.strokeStyle = v.color; ctx.lineWidth = 4; ctx.stroke(); }
        else if (v.type === 'explosion') { ctx.beginPath(); ctx.arc(v.x, v.y, v.radius * p, 0, Math.PI * 2); ctx.fillStyle = v.color; ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(v.x, v.y, v.radius * (1-p), 0, Math.PI * 2); ctx.fillStyle = v.color; ctx.fill(); }
      });
      ctx.globalAlpha = 1;
    }
    
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [setGameState, onGameOver, castAbility]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameLoop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 2 || isGameOverRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (ARENA_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (ARENA_HEIGHT / rect.height);
      if (simRef.current.player) {
        simRef.current.player.targetX = x;
        simRef.current.player.targetY = y;
        // Visual feedback for move command
        simRef.current.vfx.push({ id: Math.random().toString(), x, y, type: 'ring', color: '#60a5fa', radius: 40, timer: 300, maxTimer: 300 });
      }
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
  }, [castAbility]);

  return (
    <canvas 
      ref={canvasRef} 
      width={ARENA_WIDTH} 
      height={ARENA_HEIGHT} 
      className="bg-slate-900 border-2 border-slate-800 rounded-3xl shadow-2xl cursor-crosshair block mx-auto" 
      onContextMenu={(e) => e.preventDefault()} 
    />
  );
};

export default GameCanvas;
