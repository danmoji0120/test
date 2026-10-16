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
    damage: 30,
    rate: 0.12,
    mag: 30,
    reserve: 240,
    reload: 1.55,
    spread: 0.014,
    moving: 0.027,
    recoil: 0.016,
    range: 700,
    penetration: 2,
    durableDamage: 10,
    equip: 0.24,
    speed: 1,
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
    damage: 22,
    rate: 0.06,
    mag: 40,
    reserve: 320,
    reload: 1.15,
    spread: 0.028,
    moving: 0.009,
    recoil: 0.006,
    range: 430,
    penetration: 2,
    durableDamage: 5,
    equip: 0.16,
    speed: 1.04,
    pellets: 1,
    sound: 230,
    color: "#bcb2fa",
    price: 0,
  },
  sg: {
    id: "sg",
    name: "SG-03",
    label: "산탄총",
    role: "10발의 산탄 · 강력한 돌파",
    damage: 14,
    rate: 0.78,
    mag: 8,
    reserve: 64,
    reload: 1.95,
    spread: 0.15,
    moving: 0.03,
    recoil: 0.06,
    range: 340,
    penetration: 2,
    durableDamage: 3,
    equip: 0.28,
    speed: 1,
    pellets: 10,
    sound: 70,
    color: "#f6c779",
    price: 220,
  },
  at: {
    id: "at",
    name: "AT-01",
    label: "대전차 발사기",
    role: "장갑 관통 · 주무장 점유 / 보병은 권총으로",
    damage: 480,
    durableDamage: 420,
    penetration: 5,
    rate: 0.85,
    mag: 1,
    reserve: 3,
    reload: 3.4,
    spread: 0.018,
    moving: 0.1,
    recoil: 0.085,
    range: 1050,
    pellets: 1,
    sound: 50,
    color: "#f5a768",
    price: 0,
    equip: 0.65,
    speed: 0.94,
  },
  pistol: {
    id: "pistol",
    name: "P-01",
    label: "권총",
    role: "비상 보병 대응 · 낮은 지속 화력",
    damage: 23,
    durableDamage: 4,
    penetration: 1,
    rate: 0.25,
    mag: 12,
    reserve: 84,
    reload: 1.15,
    spread: 0.025,
    moving: 0.04,
    recoil: 0.014,
    range: 360,
    pellets: 1,
    sound: 180,
    color: "#a8d6d9",
    price: 0,
    equip: 0.16,
    speed: 1.03,
  },
} as const;
export type WeaponId = keyof typeof WEAPONS;
export type PrimaryId = Exclude<WeaponId, "pistol">;
export const PRIMARY_IDS: PrimaryId[] = ["ar", "smg", "sg", "at"];
export const CONSUMABLES = {
  frag: {
    name: "파편 수류탄",
    role: "보병 다수 제압",
    max: 3,
    prepare: 0.3,
    cooldown: 0.8,
    range: 430,
    radius: 130,
    damage: 145,
    durableDamage: 18,
    penetration: 1,
    duration: 0,
  },
  antiarmor: {
    name: "대전차 수류탄",
    role: "접근 위험 · 장갑 약점 타격",
    max: 2,
    prepare: 0.5,
    cooldown: 1,
    range: 235,
    radius: 75,
    damage: 320,
    durableDamage: 300,
    penetration: 4,
    duration: 0,
  },
  smoke: {
    name: "연막탄",
    role: "양측 관측 차단 · 총탄 통과",
    max: 2,
    prepare: 0.3,
    cooldown: 1,
    range: 410,
    radius: 145,
    damage: 0,
    durableDamage: 0,
    penetration: 0,
    duration: 14,
  },
  medical: {
    name: "의료품",
    role: "1.2초 사용 · 체력 +65",
    max: 2,
    prepare: 1.2,
    cooldown: 2,
    range: 0,
    radius: 0,
    damage: 0,
    durableDamage: 0,
    penetration: 0,
    duration: 0,
  },
} as const;
export type ConsumableId = keyof typeof CONSUMABLES;
export interface Loadout {
  primary: PrimaryId;
  secondary: "pistol";
  consumable: ConsumableId;
}
export interface GunState {
  id: WeaponId;
  ammo: number;
  reserve: number;
  reload: number;
  cooldown: number;
  recoil: number;
}
export interface ComponentState {
  hp: number;
  maxHp: number;
  destroyed: boolean;
}
export type PartId =
  "body" | "head" | "front" | "side" | "core" | "weapon" | "shield";
export type HitQuality =
  "ricochet" | "partial" | "penetration" | "weakpoint" | "component";

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
    speed: 170,
    range: 580,
    damage: 11,
    delay: 0.9,
    windup: 0.2,
    armor: 0.12,
  },
  rush: {
    name: "돌격병",
    hp: 48,
    speed: 235,
    range: 220,
    damage: 14,
    delay: 0.7,
    windup: 0.16,
    armor: 0.04,
  },
  heavy: {
    name: "지원 사수",
    hp: 105,
    speed: 125,
    range: 660,
    damage: 9,
    delay: 1.5,
    windup: 0.55,
    armor: 0.3,
  },
  juggernaut: {
    name: "중장갑 진압병",
    hp: 240,
    speed: 92,
    range: 690,
    damage: 9,
    delay: 3.8,
    windup: 1.1,
    armor: 0.85,
  },
  drone: {
    name: "무장 정찰 드론",
    hp: 50,
    speed: 270,
    range: 440,
    damage: 5,
    delay: 2.1,
    windup: 0.4,
    armor: 0.05,
  },
  walker: {
    name: "전투 보행병기",
    hp: 650,
    speed: 82,
    range: 820,
    damage: 24,
    delay: 3.6,
    windup: 1.1,
    armor: 0.95,
  },
  artillery: {
    name: "이동식 공성 병기",
    hp: 450,
    speed: 65,
    range: 1600,
    damage: 48,
    delay: 8.5,
    windup: 1.0,
    armor: 0.8,
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
  kind: "wall" | "crate" | "container" | "door" | "rock" | "fence";
  polygon?: Vec[];
  variant?: number;
  open?: boolean;
  id?: string;
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
  tactical?: boolean; // Legacy input is ignored.
  slot?: 1 | 2 | 3;
  targetX?: number;
  targetY?: number;
  drop?: boolean;
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
  character?: CharacterId;
  loadout?: Loadout;
  schema?: 2;
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
  primary: PrimaryId;
  secondary: "pistol";
  consumable: ConsumableId;
  guns: { primary: GunState; secondary: GunState };
  activeSlot: 1 | 2 | 3;
  switching: number;
  consumableCount: number;
  useTime: number;
  useCooldown: number;
  fireHeld: boolean;
  useTarget: Vec | null;
  // Read-only legacy save compatibility; not an extra equipment slot.
  tactical?: "launcher" | "ammo";
  rockets?: number;
  tacticalCooldown?: number;
  carrying?: string;
}
export interface Enemy extends Vec {
  elite?: boolean;
  components?: Partial<Record<PartId, ComponentState>>;
  turretAngle?: number;
  aimControl?: {
    point: Vec;
    velocity: Vec;
    at: number;
    target: string;
    acquired: number;
    error: number;
  };
  assignment?: "assault" | "suppress" | "flank" | "intercept" | "guard";
  phase?: "ready" | "spinup" | "firing" | "overheat";
  attackPoint?: Vec | null;
  strategicAt?: number;
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
  stagger: number;
  zone: number;
  burst: number;
  home: Vec;
  role: "assault" | "flank" | "anchor";
  alert: number;
  tactical: Vec | null;
  squad: string;
  state: AIState;
  stateTime: number;
  seenAt: number;
  reportAt?: number;
  reportKind?: "seen" | "heard";
  heardNoise: number;
  radio: number;
  patrol: Vec[];
  patrolIndex: number;
  reserve: boolean;
  sourceId: string;
  requestId: string;
  traveling: boolean;
  stuck: number;
}
export type ZoneKind =
  "warehouse" | "corridor" | "reactor" | "security" | "yard" | "extraction";
export interface Zone extends Vec {
  id: number;
  w: number;
  h: number;
  kind: ZoneKind;
  label: string;
  variant: number;
  center: Vec;
  entry: Vec;
  pads: Vec[];
}
export interface Device extends Vec {
  hp: number;
  maxHp: number;
}
export interface Smoke extends Vec {
  id: string;
  radius: number;
  until: number;
}
export interface GameMap {
  operation?: import("./missions").OperationOptions;
  deployments?: Vec[];
  generation?: { version: number; signature: string; attempts: number; diagnostics: string[] };
  smokes?: Smoke[];
  width: number;
  height: number;
  obstacles: Rect[];
  spawn: Vec;
  zones: Zone[];
  supplies: (Vec & { used: boolean })[];
  intel: Vec;
  seed: number;
  roads: Road[];
  sources: DispatchSource[];
  installations: Installation[];
  extractions: Vec[];
  patrols: Vec[][];
  terrain?: {
    biome: "barren";
    ridges: Vec[][];
    decor: (Vec & { size: number; frame: number; angle: number })[];
    elevation: number[];
  };
  topology: string;
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
    | "supply"
    | "sound";
  cue?: "gunfire" | "radio" | "steps" | "engine" | "shell";
  uncertainty?: number;
  obscured?: boolean;
  at?: number;
  toX?: number;
  toY?: number;
  weapon?: WeaponId;
  enemy?: boolean;
  actor?: string;
  pellet?: boolean;
  impact?: boolean;
  damage?: number;
  kind?: EnemyKind;
  heavy?: boolean;
  armored?: boolean;
  angle?: number;
  quality?: HitQuality;
  penetrationResult?: "failed" | "partial" | "full";
  part?: PartId;
  target?: string;
}
export interface Objective {
  id: string;
  kind: "generator" | "comms" | "outpost" | "barracks" | "intel" | import("./missions").MissionAction;
  missionId?: import("./missions").MissionId;
  facilityId?: string;
  locationId?: string;
  prerequisiteIds?: string[];
  prerequisiteMode?: "all" | "any";
  action?: import("./missions").MissionAction;
  activation?: "prerequisites" | "breach";
  phase?: string;
  phaseAt?: number;
  operatingPoint?: Vec;
  response?: number;
  effect?: import("./missions").NodeDefinition["effect"];
  failure?: "none" | "facility-destroyed";
  label: string;
  position: Vec;
  optional: boolean;
  state: "locked" | "inactive" | "available" | "active" | "complete" | "failed";
  progress: number;
  total: number;
  reward: number;
  discovered: boolean;
}
export interface Mission {
  id?: import("./missions").MissionId;
  completion?: { ids: string[]; count: number };
  timeLimit?: number;
  launch?: { position: Vec; at: number };
  cargo?: { id: string; x: number; y: number; carrier: string | null; delivered: boolean; droppedAt: number };
  defenseWaves?: number;
  stage: "recon" | "operate" | "extract" | "success" | "failed";
  objectives: Objective[];
  extraction: {
    state: "locked" | "available" | "inbound" | "landed" | "departing";
    site: Vec | null;
    requested: number;
    eta: number;
    departure: number;
    boarding: number;
  };
  elapsed: number;
  intel: boolean;
  intelProgress: number;
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
  projectiles: Projectile[];
  projectileId: number;
  wrecks: (Vec & { id: string; kind: EnemyKind; angle: number; at: number })[];
  notices: { at: number; text: string; direction: string; eta: number }[];
  responseLog: { at: number; event: string; detail: string }[];
  random: number;
  visibility: import("../game/visibility").Vision;
  alertState: AlertState;
  squads: Record<string, EnemySquad>;
  noises: Noise[];
  noiseId: number;
  supportSignals: SupportSignal[];
  reinforcements: Reinforcement[];
  dispatchId: number;
  dispatchKeys: Record<string, string>;
  trajectories: Trajectory[];
  director: { next: number; commsDown: boolean; redirectAt?: number };
  metrics: {
    firstContact: number;
    combatSeconds: number;
    revives: number;
    primaryAt: number;
    peakActors: number;
    objectiveOrder: string[];
  };
  terrainRevision: number;
  contract: "blackout" | "recon";
  difficulty: number;
}
export interface RoomView {
  code: string;
  host: string;
  phase: "lobby" | "playing" | "result";
  players: Player[];
  seed: number;
  difficulty: number;
  contract: "blackout" | "recon";
  operation?: import("./missions").OperationOptions;
  world: World | null;
}

export type SourceKind = "outpost" | "barracks" | "external";
export interface DispatchSource extends Vec {
  id: string;
  kind: SourceKind;
  entry: Vec;
  doorId: string;
  route: Vec[];
  capacity: number;
  stock: number;
  supports: EnemyKind[];
  response: number;
  prepare: number;
  interval: number;
  batch: number;
  disabled: boolean;
  cooldown: number;
  warning: number;
  blocked: boolean;
  blockProgress: number;
  facility: string;
}
export interface Installation extends Vec {
  role?: import("./missions").FacilityRole;
  zoneId?: number;
  protectionDisabled?: boolean;
  id: string;
  kind: "generator" | "comms" | "outpost" | "barracks";
  hp: number;
  maxHp: number;
  sourceId?: string;
  discovered: boolean;
  angle?: number;
  components?: Partial<Record<PartId, ComponentState>>;
  attackedAt?: number;
}
export interface Road {
  id: string;
  from: number;
  to: number;
  points: Vec[];
  width: number;
}

export type AIState =
  | "PATROL"
  | "SUSPICIOUS"
  | "INVESTIGATE"
  | "ENGAGE"
  | "REQUEST_SUPPORT"
  | "PURSUE"
  | "REGROUP"
  | "RETURN";
export interface Noise extends Vec {
  id: number;
  at: number;
  radius: number;
  kind: "gunfire" | "steps" | "destruction";
}
export interface EnemySquad {
  id: string;
  leader: string;
  members: string[];
  lastSeen: Vec | null;
  direction: Vec;
  observedAt: number;
  confidence: "seen" | "heard";
  callAt: number;
}
export interface AlertState {
  level: number;
  heat: number;
  floor: number;
  lastContact: number;
  lastRaise: number;
  reason: string;
  gates?: Record<string, number>;
}
export interface SupportSignal {
  id: string;
  squad: string;
  target: Vec;
  at: number;
}

export interface Reinforcement {
  id: string;
  key: string;
  squad: string;
  sourceId: string;
  members: string[];
  roster?: EnemyKind[];
  task?: "assault" | "search" | "block" | "defend";
  radius?: number;
  target: Vec;
  path: Vec[];
  requested: number;
  departed: number;
  arrived: number;
  eta: number;
  state: "queued" | "traveling" | "arriving" | "deployed" | "cancelled";
  reason: string;
}
export interface Trajectory {
  enemy: string;
  source: string;
  request: string;
  born: Vec;
  points: (Vec & { at: number })[];
}

export interface Projectile extends Vec {
  shell?: Vec & { height: number };
  id: string;
  kind: "rocket" | "cannon" | "mortar" | "frag" | "antiarmor" | "smoke";
  directTarget?: string;
  directPart?: PartId;
  durableDamage?: number;
  penetration?: number;
  owner: string;
  enemy: boolean;
  origin: Vec;
  target: Vec;
  angle: number;
  speed: number;
  traveled: number;
  range: number;
  at: number;
  impactAt: number;
  damage: number;
  radius: number;
}
