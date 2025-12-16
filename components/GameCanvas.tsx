import React, { useRef, useEffect, useCallback } from 'react';
import { GameState, AbilityKey, Projectile, Entity, Zone, VFX, StatusType, StatusEffect, Obstacle, NetworkMessage } from '../types';
import { ARENA_WIDTH, ARENA_HEIGHT } from '../constants';
import { DataConnection } from 'peerjs';

interface Props {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onGameOver: (winner: 'player' | 'enemy' | 'Player1' | 'Player2') => void;
  connection: DataConnection | null;
}

const GameCanvas: React.FC<Props> = ({ gameState, setGameState, onGameOver, connection }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<number>(0);
  const physicsRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(performance.now());
  const mousePosRef = useRef({ x: 0, y: 0 });
  const isGameOverRef = useRef(false);
  const syncTimerRef = useRef(0);
  const hudSyncTimerRef = useRef(0);
  
  // High-frequency simulation state
  const worldRef = useRef<GameState>(gameState);
  const aiTickRef = useRef(0);

  useEffect(() => {
    // Only update template/metadata, preserve physical properties if already in battle
    worldRef.current = {
      ...gameState,
      player: worldRef.current.player ? { ...worldRef.current.player, template: gameState.player?.template || worldRef.current.player.template } : gameState.player,
      enemy: worldRef.current.enemy ? { ...worldRef.current.enemy, template: gameState.enemy?.template || worldRef.current.enemy.template } : gameState.enemy,
      projectiles: worldRef.current.projectiles.length ? worldRef.current.projectiles : gameState.projectiles,
    };
  }, [gameState.phase, gameState.player?.template.id, gameState.enemy?.template.id]);

  // Command & Sync Handlers
  useEffect(() => {
    if (!connection) return;

    const handleData = (data: any) => {
      const msg = data as NetworkMessage;
      const world = worldRef.current;

      if (msg.type === 'battle_input' && gameState.isHost) {
        if (msg.payload.action === 'move' && world.enemy) {
          world.enemy.targetX = msg.payload.x;
          world.enemy.targetY = msg.payload.y;
        } else if (msg.payload.action === 'cast' && msg.payload.abilityId) {
          castAbility('enemy', msg.payload.abilityId, msg.payload.x, msg.payload.y);
        }
      } else if (msg.type === 'battle_sync' && !gameState.isHost) {
        const hostPlayer = msg.payload.entities.find(e => e.id === 'player');
        const hostEnemy = msg.payload.entities.find(e => e.id === 'enemy');
        
        if (hostPlayer && hostEnemy) {
          // Perspective Flip: Host's 'player' is Guest's 'enemy'
          world.enemy = { ...hostPlayer, id: 'enemy', isPlayer: false };
          
          // RECONCILIATION: For the local player, we trust the Host for HP/Mana/Stats,
          // but we only correct position if it drifts too far to prevent "snapping".
          if (world.player) {
            const dist = Math.hypot(world.player.x - hostEnemy.x, world.player.y - hostEnemy.y);
            if (dist > 100) { // Large drift - hard snap
              world.player.x = hostEnemy.x;
              world.player.y = hostEnemy.y;
            } else if (dist > 5) { // Small drift - smooth pull
              world.player.x += (hostEnemy.x - world.player.x) * 0.15;
              world.player.y += (hostEnemy.y - world.player.y) * 0.15;
            }
            // Update authoritative stats from Host
            world.player.stats = hostEnemy.stats;
            world.player.buffs = hostEnemy.buffs;
            world.player.attackTimer = hostEnemy.attackTimer;
          } else {
            world.player = { ...hostEnemy, id: 'player', isPlayer: true };
          }
        }
        
        world.projectiles = msg.payload.projectiles;
        world.zones = msg.payload.zones;
        const newVfx = msg.payload.vfx.filter(v => !world.vfx.find(pv => pv.id === v.id));
        world.vfx = [...world.vfx, ...newVfx];
        world.countdown = msg.payload.countdown;
      } else if (msg.type === 'battle_over') {
        isGameOverRef.current = true;
      }
    };

    connection.on('data', handleData);
    return () => { connection.off('data', handleData); };
  }, [gameState.isHost, connection]);

  const checkWallCollision = (x: number, y: number, radius: number, obstacles: Obstacle[]) => {
    const r = radius + 2;
    if (x < r || x > ARENA_WIDTH - r || y < r || y > ARENA_HEIGHT - r) return true;
    for (const o of obstacles) {
      if (x + r > o.x && x - r < o.x + o.width && y + r > o.y && y - r < o.y + o.height) return true;
    }
    return false;
  };

  const applyDamage = (ent: Entity, amount: number, vfx: VFX[]): void => {
    if (ent.stats.hp <= 0) return;
    const shieldIndex = ent.buffs.findIndex(b => b.type === StatusType.SHIELD);
    if (shieldIndex !== -1) {
      const shield = ent.buffs[shieldIndex];
      const shieldVal = shield.value || 0;
      if (shieldVal >= amount) {
        shield.value = shieldVal - amount;
        vfx.push({ id: Math.random().toString(), x: ent.x, y: ent.y, type: 'impact', color: '#FFD700', radius: 40, timer: 200, maxTimer: 200 });
        return;
      } else {
        const remaining = amount - shieldVal;
        ent.buffs.splice(shieldIndex, 1);
        ent.stats.hp -= remaining;
      }
    } else {
      ent.stats.hp -= amount;
    }
  };

  const applyStatus = (ent: Entity, effect: StatusEffect): void => {
    if (ent.stats.hp <= 0) return;
    const existingIndex = ent.buffs.findIndex(b => b.type === effect.type);
    if (existingIndex !== -1) {
      const existing = ent.buffs[existingIndex];
      existing.timer = Math.max(existing.timer, effect.timer);
      if (effect.type === StatusType.SHIELD) existing.value = (existing.value || 0) + (effect.value || 0);
      else existing.value = effect.value;
    } else {
      ent.buffs.push({ ...effect });
    }
  };

  const castAbility = (ownerId: 'player' | 'enemy', abilityId: AbilityKey, tx: number, ty: number) => {
    const world = worldRef.current;
    const caster = ownerId === 'player' ? world.player : world.enemy;
    const target = ownerId === 'player' ? world.enemy : world.player;
    
    if (!caster || !target || caster.stats.hp <= 0 || caster.buffs.some(b => b.type === StatusType.STUN)) return;
    
    const ability = caster.template.abilities.find(a => a.id === abilityId);
    if (!ability || ability.currentCooldown > 0 || caster.stats.mana < ability.manaCost) return;

    caster.stats.mana -= ability.manaCost;
    ability.currentCooldown = ability.cooldown;

    if (ability.type === 'projectile') {
      const angle = Math.atan2(ty - caster.y, tx - caster.x);
      const speed = ability.speed || 1400;
      world.projectiles.push({
        id: Math.random().toString(),
        x: caster.x + Math.cos(angle) * (caster.radius + 15),
        y: caster.y + Math.sin(angle) * (caster.radius + 15),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 12, damage: ability.damage, ownerId: caster.id,
        color: ability.color, life: (ability.range || 1000) / speed, effect: ability.effect
      });
    } else if (ability.type === 'aoe') {
      world.vfx.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'ring', color: ability.color, radius: ability.radius || 100, timer: 400, maxTimer: 400 });
      const dist = Math.hypot(target.x - caster.x, target.y - caster.y);
      if (dist < (ability.radius || 100) + target.radius) {
        applyDamage(target, ability.damage, world.vfx);
        if (ability.effect) applyStatus(target, ability.effect);
      }
    } else if (ability.type === 'dash') {
      const angle = Math.atan2(ty - caster.y, tx - caster.x);
      const range = ability.range || 300;
      const steps = 10;
      for (let i = steps; i >= 0; i--) {
        const tx_ = caster.x + Math.cos(angle) * (range * (i / steps));
        const ty_ = caster.y + Math.sin(angle) * (range * (i / steps));
        if (!checkWallCollision(tx_, ty_, caster.radius, world.obstacles)) {
          caster.x = tx_; caster.y = ty_; caster.targetX = tx_; caster.targetY = ty_;
          break;
        }
      }
      world.vfx.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'shockwave', color: ability.color, radius: 120, timer: 300, maxTimer: 300 });
    } else if (ability.type === 'self-buff') {
      world.vfx.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'ring', color: ability.color, radius: caster.radius * 2, timer: 300, maxTimer: 300 });
      if (ability.effect) applyStatus(caster, ability.effect);
    } else if (ability.type === 'target-delayed') {
      world.zones.push({
        id: Math.random().toString(), x: tx, y: ty, radius: ability.radius || 140, timer: 800, maxTimer: 800, damage: ability.damage, ownerId: caster.id, color: ability.color, effect: ability.effect
      });
    }
  };

  const runPhysics = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(now - lastUpdateRef.current, 50);
    lastUpdateRef.current = now;
    const dtSec = dt / 1000;

    const world = worldRef.current;
    if (world.phase !== 'battle' || isGameOverRef.current) return;

    if (world.countdown > 0) {
      world.countdown = Math.max(0, world.countdown - dt);
      return;
    }

    const { player, enemy, projectiles, zones, vfx, obstacles } = world;
    if (!player || !enemy) return;

    // LOCAL PREDICTION: Both Host and Guest simulate local player movement locally
    // Host simulates both, Guest simulates local and relies on sync for enemy.
    [player, enemy].forEach((ent, idx) => {
      // If we are guest, we only simulate OUR character (player) for prediction
      // If we are host, we simulate both
      const isLocal = idx === 0; // 'player' is always local character in this context
      if (!world.isHost && !isLocal) return; 
      
      if (ent.stats.hp <= 0) return;
      
      // Cooldowns and Mana (Host strictly authoritative, but local predictive for smoothness)
      ent.stats.mana = Math.min(ent.stats.maxMana, ent.stats.mana + ent.stats.manaRegen * dtSec);
      ent.template.abilities.forEach(a => a.currentCooldown = Math.max(0, a.currentCooldown - dt));
      
      let speed = ent.stats.speed;
      for (let i = ent.buffs.length - 1; i >= 0; i--) {
        const b = ent.buffs[i];
        if (world.isHost) b.timer -= dt; // Host manages buff timers
        if (b.type === StatusType.SLOW) speed *= (1 - (b.value || 0.3));
        if (b.type === StatusType.SPEED) speed += (b.value || 0);
        if (world.isHost && b.timer <= 0) ent.buffs.splice(i, 1);
      }

      if (!ent.buffs.some(b => b.type === StatusType.STUN)) {
        const dx = ent.targetX - ent.x, dy = ent.targetY - ent.y, d = Math.hypot(dx, dy);
        if (d > 5) {
          const ang = Math.atan2(dy, dx); ent.angle = ang;
          const vx = Math.cos(ang) * Math.min(d, speed * dtSec);
          const vy = Math.sin(ang) * Math.min(d, speed * dtSec);
          if (!checkWallCollision(ent.x + vx, ent.y, ent.radius, obstacles)) ent.x += vx;
          if (!checkWallCollision(ent.x, ent.y + vy, ent.radius, obstacles)) ent.y += vy;
          ent.state = 'moving';
        } else { ent.state = 'idle'; }
      }
      
      if (world.isHost) {
        const other = idx === 0 ? enemy : player;
        if (other.stats.hp > 0 && Math.hypot(other.x - ent.x, other.y - ent.y) < ent.stats.attackRange && ent.attackTimer <= 0) {
          applyDamage(other, ent.stats.baseAttackDamage, vfx);
          ent.attackTimer = 1000 / ent.stats.attackSpeed;
          vfx.push({ id: Math.random().toString(), x: other.x, y: other.y, type: 'impact', color: ent.template.color, radius: 20, timer: 150, maxTimer: 150 });
        }
        ent.attackTimer = Math.max(0, ent.attackTimer - dt);
      }
    });

    // WORLD SIMULATION: Only Host manages global objects
    if (world.isHost) {
      for (let i = vfx.length - 1; i >= 0; i--) {
        vfx[i].timer -= dt;
        if (vfx[i].timer <= 0) vfx.splice(i, 1);
      }

      for (let i = zones.length - 1; i >= 0; i--) {
        const z = zones[i];
        z.timer -= dt;
        if (z.timer <= 0) {
          const pDist = Math.hypot(player.x - z.x, player.y - z.y);
          const eDist = Math.hypot(enemy.x - z.x, enemy.y - z.y);
          if (pDist < z.radius + player.radius) { applyDamage(player, z.damage, vfx); if (z.effect) applyStatus(player, z.effect); }
          if (eDist < z.radius + enemy.radius) { applyDamage(enemy, z.damage, vfx); if (z.effect) applyStatus(enemy, z.effect); }
          vfx.push({ id: Math.random().toString(), x: z.x, y: z.y, type: 'explosion', color: z.color, radius: z.radius, timer: 400, maxTimer: 400 });
          zones.splice(i, 1);
        }
      }

      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx * dtSec; p.y += p.vy * dtSec; p.life -= dtSec;
        if (p.life <= 0 || checkWallCollision(p.x, p.y, p.radius, obstacles)) { projectiles.splice(i, 1); continue; }
        const target = p.ownerId === 'player' ? enemy : player;
        if (target.stats.hp > 0 && Math.hypot(target.x - p.x, target.y - p.y) < target.radius + p.radius) {
          applyDamage(target, p.damage, vfx);
          if (p.effect) applyStatus(target, p.effect);
          projectiles.splice(i, 1);
        }
      }

      if (world.gameMode === 'SOLO' && enemy.stats.hp > 0 && !enemy.buffs.some(b => b.type === StatusType.STUN)) {
        aiTickRef.current++;
        if (aiTickRef.current % 15 === 0) {
          enemy.targetX = player.x; enemy.targetY = player.y;
          if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < 500) {
            castAbility('enemy', AbilityKey.A, player.x, player.y);
          }
        }
      }

      // Sync Heartbeat (Increased to ~33 FPS)
      syncTimerRef.current -= dt;
      if (syncTimerRef.current <= 0 && connection?.open) {
        connection.send({
          type: 'battle_sync',
          payload: {
            entities: [player, enemy], projectiles, zones, vfx, countdown: world.countdown
          }
        });
        syncTimerRef.current = 30; 
      }

      if (player.stats.hp <= 0) onGameOver('enemy');
      else if (enemy.stats.hp <= 0) onGameOver('player');
    } else {
      // Guest local VFX cleanup
      for (let i = vfx.length - 1; i >= 0; i--) {
        vfx[i].timer -= dt;
        if (vfx[i].timer <= 0) vfx.splice(i, 1);
      }
    }

    hudSyncTimerRef.current -= dt;
    if (hudSyncTimerRef.current <= 0) {
      setGameState({ ...world });
      hudSyncTimerRef.current = 100;
    }
  }, [connection, onGameOver, setGameState]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const s = worldRef.current;
    if (!ctx || !canvas || s.phase !== 'battle') return;

    ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    
    // Grid
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
    for (let x = 0; x < ARENA_WIDTH; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT); ctx.stroke(); }
    for (let y = 0; y < ARENA_HEIGHT; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y); ctx.stroke(); }
    
    // Elements
    s.obstacles.forEach(o => { ctx.fillStyle = '#1e293b'; ctx.fillRect(o.x, o.y, o.width, o.height); });
    s.zones.forEach(z => { ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fillStyle = z.color + '22'; ctx.fill(); ctx.strokeStyle = z.color; ctx.stroke(); });
    s.projectiles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); });

    // Entities
    [s.player, s.enemy].forEach(ent => {
      if (!ent || ent.stats.hp <= 0) return;
      ctx.save(); ctx.translate(ent.x, ent.y); ctx.rotate(ent.angle);
      ctx.beginPath(); ctx.arc(0, 0, ent.radius, 0, Math.PI * 2); ctx.fillStyle = ent.template.color; ctx.fill();
      ctx.beginPath(); ctx.moveTo(ent.radius, 0); ctx.lineTo(ent.radius + 15, 0); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
      
      ctx.fillStyle = '#0f172a'; ctx.fillRect(ent.x - 25, ent.y - 45, 50, 6);
      ctx.fillStyle = ent.template.color; ctx.fillRect(ent.x - 25, ent.y - 45, 50 * (ent.stats.hp / ent.stats.maxHp), 6);
    });

    // VFX
    s.vfx.forEach(v => {
      const p = 1 - (v.timer / v.maxTimer); ctx.globalAlpha = 1 - p;
      ctx.beginPath(); ctx.arc(v.x, v.y, v.radius * p, 0, Math.PI * 2); ctx.strokeStyle = v.color; ctx.lineWidth = 4; ctx.stroke();
    });
    ctx.globalAlpha = 1;

    renderRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    renderRef.current = requestAnimationFrame(draw);
    physicsRef.current = window.setInterval(runPhysics, 16); // ~60fps physics
    return () => {
      cancelAnimationFrame(renderRef.current);
      clearInterval(physicsRef.current);
    };
  }, [draw, runPhysics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 2 || isGameOverRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (ARENA_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (ARENA_HEIGHT / rect.height);
      
      const world = worldRef.current;
      if (world.player) {
        // CLIENT PREDICTION: Apply movement locally immediately
        world.player.targetX = x;
        world.player.targetY = y;
      }
      
      if (!gameState.isHost && connection?.open) {
        connection.send({ type: 'battle_input', payload: { action: 'move', x, y } });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const keys: Record<string, AbilityKey> = { 'a': AbilityKey.A, 's': AbilityKey.S, 'd': AbilityKey.D, 'f': AbilityKey.F };
      const abilityId = keys[e.key.toLowerCase()];
      if (abilityId) {
        if (gameState.isHost) {
          castAbility('player', abilityId, mousePosRef.current.x, mousePosRef.current.y);
        } else if (connection?.open) {
          // Note: Guest only predicts MOVEMENT, not combat to prevent desync on health/effects
          connection.send({ type: 'battle_input', payload: { action: 'cast', x: mousePosRef.current.x, y: mousePosRef.current.y, abilityId } });
        }
      }
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
  }, [gameState.isHost, connection]);

  return (
    <canvas 
      ref={canvasRef} 
      width={ARENA_WIDTH} 
      height={ARENA_HEIGHT} 
      className="bg-slate-900 border-2 border-[#d4af37]/20 rounded-3xl shadow-2xl cursor-crosshair block mx-auto transition-shadow hover:shadow-[#d4af37]/5" 
      onContextMenu={(e) => e.preventDefault()} 
    />
  );
};

export default GameCanvas;