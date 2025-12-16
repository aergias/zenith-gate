import React, { useRef, useEffect, useCallback } from 'react';
import { GameState, AbilityKey, Projectile, Entity, Zone, VFX, StatusType, StatusEffect, Obstacle, Ability, NetworkMessage } from '../types';
import { ARENA_WIDTH, ARENA_HEIGHT } from '../constants';
import { soundService } from '../services/soundService';
import { DataConnection } from 'peerjs';

interface Props {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onGameOver: (winner: 'player' | 'enemy' | 'Player1' | 'Player2') => void;
  connection: DataConnection | null;
}

const GameCanvas: React.FC<Props> = ({ gameState, setGameState, onGameOver, connection }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(performance.now());
  const mousePosRef = useRef({ x: 0, y: 0 });
  const isGameOverRef = useRef(false);
  const syncTimerRef = useRef(0);
  
  const simRef = useRef<GameState>(gameState);
  
  // AI Tactical State (Solo only)
  const aiTickRef = useRef(0);

  useEffect(() => {
    simRef.current = gameState;
  }, [gameState]);

  // Handle incoming commands on the host side
  useEffect(() => {
    if (gameState.isHost && connection) {
      const handleData = (data: any) => {
        const msg = data as NetworkMessage;
        if (msg.type === 'battle_input') {
          const s = simRef.current;
          // Note: for the host, 'enemy' is the other player
          if (msg.payload.action === 'move' && s.enemy) {
            s.enemy.targetX = msg.payload.x;
            s.enemy.targetY = msg.payload.y;
          } else if (msg.payload.action === 'cast' && msg.payload.abilityId) {
            castAbility('enemy', msg.payload.abilityId, msg.payload.x, msg.payload.y);
          }
        }
      };
      connection.on('data', handleData);
      return () => { connection.off('data', handleData); };
    }
  }, [gameState.isHost, connection]);

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
        return ent;
      } else {
        const remaining = amount - shieldVal;
        ent.buffs.splice(shieldIndex, 1);
        ent.stats.hp -= remaining;
      }
    } else {
      ent.stats.hp -= amount;
    }
    return ent;
  };

  const applyStatus = (ent: Entity, effect: StatusEffect): Entity => {
    if (ent.stats.hp <= 0) return ent;
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
    if (s.phase !== 'battle' || s.countdown > 0 || isGameOverRef.current) return;
    
    const caster = ownerId === 'player' ? s.player : s.enemy;
    const target = ownerId === 'player' ? s.enemy : s.player;
    if (!caster || !target || caster.stats.hp <= 0 || caster.buffs.some(b => b.type === StatusType.STUN)) return;
    
    const ability = caster.template.abilities.find(a => a.id === abilityId);
    if (!ability || ability.currentCooldown > 0 || caster.stats.mana < ability.manaCost) return;

    caster.stats.mana -= ability.manaCost;
    ability.currentCooldown = ability.cooldown;

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
      s.vfx.push({ id: Math.random().toString(), x: caster.x, y: caster.y, type: 'ring', color: ability.color, radius: ability.radius || 100, timer: 400, maxTimer: 400 });
      const dist = Math.hypot(target.x - caster.x, target.y - caster.y);
      if (dist < (ability.radius || 100) + target.radius) {
        applyDamage(target, ability.damage, s.vfx);
        if (ability.effect) applyStatus(target, ability.effect);
      }
    } else if (ability.type === 'dash') {
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
    if (s.phase === 'battle') {
      if (s.countdown > 0) {
        s.countdown = Math.max(0, s.countdown - dt);
      } else if (s.isHost) {
        // Authoritative logic loop for host
        const { player, enemy, projectiles, zones, vfx, obstacles } = s;
        if (!player || !enemy) return;

        // Process VFX
        for (let i = vfx.length - 1; i >= 0; i--) {
          vfx[i].timer -= dt;
          if (vfx[i].timer <= 0) vfx.splice(i, 1);
        }

        // Process Zones
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

        // Projectiles
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

        // SOLO AI
        if (s.gameMode === 'SOLO' && enemy.stats.hp > 0 && !enemy.buffs.some(b => b.type === StatusType.STUN)) {
           aiTickRef.current++;
           if (aiTickRef.current % 15 === 0) {
             enemy.targetX = player.x; enemy.targetY = player.y;
             if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < 500) {
               castAbility('enemy', AbilityKey.A, player.x, player.y);
             }
           }
        }

        // Entity updates
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
              const ang = Math.atan2(dy, dx); ent.angle = ang;
              const vx = Math.cos(ang) * Math.min(d, speed * dtSec);
              const vy = Math.sin(ang) * Math.min(d, speed * dtSec);
              if (!checkWallCollision(ent.x + vx, ent.y, ent.radius, obstacles)) ent.x += vx;
              if (!checkWallCollision(ent.x, ent.y + vy, ent.radius, obstacles)) ent.y += vy;
              ent.state = 'moving';
            } else { ent.state = 'idle'; }

            const other = idx === 0 ? enemy : player;
            if (other.stats.hp > 0 && Math.hypot(other.x - ent.x, other.y - ent.y) < ent.stats.attackRange && ent.attackTimer <= 0) {
              applyDamage(other, ent.stats.baseAttackDamage, vfx);
              ent.attackTimer = 1000 / ent.stats.attackSpeed;
              vfx.push({ id: Math.random().toString(), x: other.x, y: other.y, type: 'impact', color: ent.template.color, radius: 20, timer: 150, maxTimer: 150 });
            }
          }
          ent.attackTimer = Math.max(0, ent.attackTimer - dt);
        });

        // Broadcast to guest
        if (s.gameMode === 'MULTIPLAYER' && connection?.open) {
          syncTimerRef.current -= dt;
          if (syncTimerRef.current <= 0) {
            connection.send({
              type: 'battle_sync',
              payload: {
                entities: [player, enemy], projectiles, zones, vfx, countdown: s.countdown
              }
            });
            syncTimerRef.current = 50;
          }
        }

        if (player.stats.hp <= 0) onGameOver('enemy');
        else if (enemy.stats.hp <= 0) onGameOver('player');
      } else {
        // Guest perspective: smoothly animate local VFX but wait for host sync for everything else
        const { vfx } = s;
        for (let i = vfx.length - 1; i >= 0; i--) {
          vfx[i].timer -= dt;
          if (vfx[i].timer <= 0) vfx.splice(i, 1);
        }
      }
    }

    setGameState({ ...simRef.current });

    // Rendering
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      const s = simRef.current;
      ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
      for (let x = 0; x < ARENA_WIDTH; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT); ctx.stroke(); }
      for (let y = 0; y < ARENA_HEIGHT; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y); ctx.stroke(); }
      s.obstacles.forEach(o => { ctx.fillStyle = '#1e293b'; ctx.fillRect(o.x, o.y, o.width, o.height); });
      s.zones.forEach(z => { ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fillStyle = z.color + '22'; ctx.fill(); ctx.strokeStyle = z.color; ctx.stroke(); });
      s.projectiles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); });

      [s.player, s.enemy].forEach(ent => {
        if (!ent || ent.stats.hp <= 0) return;
        ctx.save(); ctx.translate(ent.x, ent.y); ctx.rotate(ent.angle);
        ctx.beginPath(); ctx.arc(0, 0, ent.radius, 0, Math.PI * 2); ctx.fillStyle = ent.template.color; ctx.fill();
        ctx.beginPath(); ctx.moveTo(ent.radius, 0); ctx.lineTo(ent.radius + 15, 0); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
        ctx.restore();
        // HP bar above head
        ctx.fillStyle = '#1e293b'; ctx.fillRect(ent.x - 25, ent.y - 45, 50, 6);
        ctx.fillStyle = ent.template.color; ctx.fillRect(ent.x - 25, ent.y - 45, 50 * (ent.stats.hp / ent.stats.maxHp), 6);
      });

      s.vfx.forEach(v => {
        const p = 1 - (v.timer / v.maxTimer); ctx.globalAlpha = 1 - p;
        ctx.beginPath(); ctx.arc(v.x, v.y, v.radius * p, 0, Math.PI * 2); ctx.strokeStyle = v.color; ctx.lineWidth = 4; ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [setGameState, onGameOver, connection]);

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
      
      if (gameState.isHost) {
        if (simRef.current.player) { simRef.current.player.targetX = x; simRef.current.player.targetY = y; }
      } else if (connection?.open) {
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
  }, [gameState.isHost, connection, castAbility]);

  return (
    <canvas ref={canvasRef} width={ARENA_WIDTH} height={ARENA_HEIGHT} className="bg-slate-900 border-2 border-slate-800 rounded-3xl shadow-2xl cursor-crosshair block mx-auto" onContextMenu={(e) => e.preventDefault()} />
  );
};

export default GameCanvas;