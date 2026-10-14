export const CHARACTERS = {
  aria: {
    name: "아리아",
    callsign: "ARIA",
    role: "돌격 오퍼레이터",
    color: "#f2a0be",
    hair: "#f4a6c4",
    speed: 1.06,
    revive: 1,
    quote: "준비됐지? 멋지게 끝내고 돌아오자!",
  },
  luna: {
    name: "루나",
    callsign: "LUNA",
    role: "지원 오퍼레이터",
    color: "#b8b6f4",
    hair: "#e4e1fa",
    speed: 1,
    revive: 1.35,
    quote: "내가 엄호할게. 모두 함께 돌아가는 거야.",
  },
} as const;
export type CharacterId = keyof typeof CHARACTERS;
export const WEAPONS = {
  ar: {
    id: "ar",
    name: "AR-01",
    label: "돌격소총",
    role: "안정적인 중거리 교전",
    damage: 27,
    rate: 0.13,
    mag: 30,
    reserve: 240,
    reload: 1.8,
    spread: 0.022,
    moving: 0.045,
    recoil: 0.014,
    range: 700,
    penetration: 0.72,
    pellets: 1,
    sound: 140,
    color: "#7de4d5",
    price: 0,
  },
  smg: {
    id: "smg",
    name: "SMG-02",
    label: "기관단총",
    role: "빠른 기동 · 근거리 제압",
    damage: 17,
    rate: 0.075,
    mag: 40,
    reserve: 320,
    reload: 1.45,
    spread: 0.037,
    moving: 0.03,
    recoil: 0.009,
    range: 450,
    penetration: 0.4,
    pellets: 1,
    sound: 230,
    color: "#bcb2fa",
    price: 0,
  },
  sg: {
    id: "sg",
    name: "SG-03",
    label: "산탄총",
    role: "8발의 산탄 · 강력한 돌파",
    damage: 15,
    rate: 0.7,
    mag: 8,
    reserve: 64,
    reload: 2.2,
    spread: 0.17,
    moving: 0.03,
    recoil: 0.06,
    range: 340,
    penetration: 0.55,
    pellets: 8,
    sound: 70,
    color: "#f6c779",
    price: 220,
  },
} as const;
export type WeaponId = keyof typeof WEAPONS;
export const MODS = {
  none: { name: "기본 사양", price: 0, description: "균형 잡힌 기본 세팅" },
  stabilizer: {
    name: "안정화 그립",
    price: 140,
    description: "반동 −30% · 이동속도 −4%",
  },
  loader: {
    name: "고속 장전기",
    price: 140,
    description: "장전시간 −20% · 탄퍼짐 +10%",
  },
} as const;
export type ModId = keyof typeof MODS;
export const ENEMIES = {
  rifle: {
    name: "소총병",
    hp: 65,
    speed: 100,
    range: 510,
    damage: 8,
    delay: 1.6,
    windup: 0.55,
    armor: 0.12,
  },
  rush: {
    name: "돌격병",
    hp: 48,
    speed: 155,
    range: 180,
    damage: 10,
    delay: 1.1,
    windup: 0.35,
    armor: 0.04,
  },
  heavy: {
    name: "지원 사수",
    hp: 105,
    speed: 65,
    range: 650,
    damage: 13,
    delay: 2.0,
    windup: 1.0,
    armor: 0.3,
  },
} as const;
export type EnemyKind = keyof typeof ENEMIES;
export interface Vec {
  x: number;
  y: number;
}
export interface Rect extends Vec {
  w: number;
  h: number;
  kind: "wall" | "crate" | "container";
}
export interface Input {
  dx: number;
  dy: number;
  angle: number;
  fire: boolean;
  aim: boolean;
  sprint: boolean;
  reload: boolean;
  interact: boolean;
  revive: boolean;
}
export const emptyInput = (): Input => ({
  dx: 0,
  dy: 0,
  angle: 0,
  fire: false,
  aim: false,
  sprint: false,
  reload: false,
  interact: false,
  revive: false,
});
export interface Profile {
  token: string;
  credits: number;
  unlocks: WeaponId[];
  mods: ModId[];
  runs: number;
  wins: number;
  kills: number;
  settled: string[];
}
export interface Player extends Vec {
  id: string;
  name: string;
  character: CharacterId;
  weapon: WeaponId;
  mod: ModId;
  hp: number;
  ammo: number;
  reserve: number;
  angle: number;
  down: boolean;
  connected: boolean;
  ready: boolean;
  reload: number;
  cooldown: number;
  recoil: number;
  kills: number;
  reviveProgress: number;
  hurt: number;
  moving: boolean;
  input: Input;
  inputAt: number;
}
export interface Enemy extends Vec {
  id: string;
  kind: EnemyKind;
  hp: number;
  angle: number;
  cooldown: number;
  windup: number;
  target: string | null;
  lastSeen: Vec | null;
  memory: number;
  path: Vec[];
  repath: number;
  hurt: number;
  home: Vec;
}
export interface GameMap {
  width: number;
  height: number;
  obstacles: Rect[];
  spawn: Vec;
  core: Vec;
  relays: Vec[];
  extract: Vec;
  supplies: (Vec & { used: boolean })[];
  intel: Vec;
  seed: number;
}
export interface GameEvent extends Vec {
  id: number;
  type:
    | "shot"
    | "hit"
    | "kill"
    | "reload"
    | "alarm"
    | "explode"
    | "revive"
    | "supply";
  toX?: number;
  toY?: number;
  weapon?: WeaponId;
  enemy?: boolean;
  actor?: string;
}
export interface Mission {
  stage: "infiltrate" | "plant" | "defend" | "extract" | "success" | "failed";
  relays: number[];
  plant: number;
  timer: number;
  extract: number;
  elapsed: number;
  intel: boolean;
  intelProgress: number;
  wave: number;
  reward: number;
  reason: string;
}
export interface World {
  id: string;
  map: GameMap;
  players: Player[];
  enemies: Enemy[];
  mission: Mission;
  events: GameEvent[];
  eventId: number;
  time: number;
  random: number;
}
export interface RoomView {
  code: string;
  host: string;
  phase: "lobby" | "playing" | "result";
  players: Player[];
  seed: number;
  difficulty: "normal" | "hard";
  world: World | null;
}
