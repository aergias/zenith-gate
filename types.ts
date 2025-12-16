export type Point = { x: number; y: number };

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export enum AbilityKey {
  A = 'a',
  S = 's',
  D = 'd',
  F = 'f'
}

export enum StatusType {
  BURN = 'burn',
  SLOW = 'slow',
  STUN = 'stun',
  SHIELD = 'shield',
  SPEED = 'speed'
}

export type StatusEffect = {
  type: StatusType;
  timer: number;
  value?: number;
};

export type Ability = {
  id: AbilityKey;
  name: string;
  cooldown: number;
  currentCooldown: number;
  damage: number;
  description: string;
  detailedDescription?: string;
  icon: string;
  manaCost: number;
  type: 'projectile' | 'aoe' | 'dash' | 'self-buff' | 'target-delayed';
  range?: number;
  radius?: number;
  speed?: number;
  color: string;
  effect?: StatusEffect;
  bypassesWalls?: boolean;
};

export type CharacterStats = {
  maxHp: number;
  hp: number;
  maxMana: number;
  mana: number;
  manaRegen: number;
  speed: number;
  baseAttackDamage: number;
  attackRange: number;
  attackSpeed: number;
};

export type CharacterTemplate = {
  id: string;
  name: string;
  role: string;
  bio: string;
  difficulty: 1 | 2 | 3;
  stats: CharacterStats;
  abilities: Ability[];
  color: string;
  accentColor: string;
  modelType: 'mage' | 'warrior' | 'ranger' | 'assassin';
  avatar: string;
};

export type Zone = {
  id: string;
  x: number;
  y: number;
  radius: number;
  timer: number;
  maxTimer: number;
  damage: number;
  ownerId: string;
  color: string;
  effect?: StatusEffect;
};

export type VFX = {
  id: string;
  x: number;
  y: number;
  type: 'ring' | 'explosion' | 'impact' | 'trail' | 'crack' | 'aura' | 'ember' | 'shatter' | 'shockwave' | 'stunned' | 'burning' | 'wall-hit' | 'lightning' | 'crystal';
  color: string;
  timer: number;
  maxTimer: number;
  radius: number;
  targetId?: string;
};

export type Obstacle = {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'wall' | 'pillar' | 'crystal';
};

export type ArenaLayout = {
  id: string;
  name: string;
  obstacles: Obstacle[];
};

export type Entity = {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius: number;
  stats: CharacterStats;
  template: CharacterTemplate;
  isPlayer: boolean;
  angle: number;
  state: 'idle' | 'moving' | 'attacking' | 'casting';
  buffs: StatusEffect[];
  attackTimer: number;
  isDashing?: boolean;
};

export type Projectile = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  ownerId: string;
  color: string;
  life: number;
  effect?: StatusEffect;
};

export type GameMode = 'SOLO' | 'MULTIPLAYER';
export type TurnOwner = 'Player1' | 'Player2';

// Lobby specific types
export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isAi?: boolean;
}

export interface Player {
  id: string;
  name: string;
  role: 'pilot' | 'navigator' | 'ai-host';
  status: 'ready' | 'waiting';
  avatar: string;
}

export type GameState = {
  player: Entity | null;
  enemy: Entity | null;
  projectiles: Projectile[];
  zones: Zone[];
  vfx: VFX[];
  obstacles: Obstacle[];
  winner: 'player' | 'enemy' | 'Player1' | 'Player2' | null;
  phase: 'selection' | 'lobby' | 'prep' | 'battle' | 'results';
  gameMode: GameMode;
  matchId?: string;
  myRole?: TurnOwner;
  currentTurn: TurnOwner;
  turnStatus: 'Active' | 'Waiting' | 'Executing';
  selectedArenaId: string;
  countdown: number;
  tacticalAdvice?: string;
  isConnecting?: boolean;
  remoteSelectedChar?: CharacterTemplate;
  remoteUsername?: string;
  localUsername: string;
  remoteReady: boolean;
  localReady: boolean;
  isPaused?: boolean;
  localSelectedChar?: CharacterTemplate;
  isHost: boolean;
  messages: Message[];
  lobbyPlayers: Player[];
};