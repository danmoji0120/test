/** Mission definitions precede placement. No world coordinates or enemy intelligence live here. */
export const WORLD_PROFILES = {
  compact: { width: 3200, height: 2400, label: "집중 전장" },
  standard: { width: 6400, height: 4200, label: "표준 작전구역" },
  large: { width: 9600, height: 6300, label: "광역 작전구역" },
  expanded: { width: 12800, height: 8400, label: "확장 작전구역" },
} as const;
export type WorldProfileId = keyof typeof WORLD_PROFILES;
export type MissionId = "launch" | "reactor" | "transfer" | "survey" | "blitz" | "defense";
export type MissionAction = "interact" | "destroy" | "launch" | "collect" | "upload" | "drill" | "analyze" | "defend" | "radar" | "supply";
export type FacilityRole = "command" | "power" | "silo" | "cooling" | "reactor" | "archive" | "transmitter" | "drill" | "analyzer" | "production" | "beacon" | "comms" | "barracks" | "radar" | "supply" | "artillery";
export interface NodeDefinition {
  id: string;
  label: string;
  action: MissionAction;
  role: FacilityRole;
  required: boolean;
  prerequisiteIds: string[];
  prerequisiteMode: "all" | "any";
  activation: "prerequisites" | "breach";
  work: number;
  public: boolean;
  reward: number;
  response: number;
  failure: "none" | "facility-destroyed";
  effect?: "regional-comms" | "disable-source" | "reveal" | "resupply" | "silence-artillery";
}
export interface MissionDefinition {
  id: MissionId;
  title: string;
  description: string;
  profiles: WorldProfileId[];
  defaultProfile: WorldProfileId;
  minutes: number;
  nodes: NodeDefinition[];
  completion: { ids: string[]; count: number };
}
function node(id: string, label: string, role: FacilityRole, action: MissionAction,
  work: number, prerequisiteIds: string[] = [], extra: Partial<NodeDefinition> = {}): NodeDefinition {
  return { id, label, role, action, work, prerequisiteIds, prerequisiteMode: "all",
    required: true, activation: "prerequisites", public: prerequisiteIds.length === 0,
    reward: 120, response: 12, failure: action === "destroy" ? "none" : "facility-destroyed", ...extra };
}
const optional = () => [
  node("radio", "지역 통신시설 무력화", "comms", "destroy", 260, [], { required: false, public: false, effect: "regional-comms" }),
  node("barracks", "지역 병영 무력화", "barracks", "destroy", 260, [], { required: false, public: false, effect: "disable-source" }),
  node("radar", "정찰 레이더 확보", "radar", "radar", 2, [], { required: false, public: false, effect: "reveal" }),
  node("depot", "야전 보급소 확보", "supply", "supply", 1.5, [], { required: false, public: false, effect: "resupply" }),
  node("artillery", "포병 지휘시설 무력화", "artillery", "destroy", 260, [], { required: false, public: false, effect: "silence-artillery" }),
];
export const MISSIONS: Record<MissionId, MissionDefinition> = {
  launch: { id: "launch", title: "STRATEGIC LAUNCH", description: "코드·전력을 자유 순서로 확보하고 미사일을 발사하세요.",
    profiles: ["large", "expanded"], defaultProfile: "large", minutes: 24,
    nodes: [node("code", "발사 승인 코드 확보", "command", "interact", 2),
      node("power", "발사 기지 전력 복구", "power", "interact", 3),
      node("launch", "전략 미사일 발사", "silo", "launch", 3, ["code", "power"]), ...optional()],
    completion: { ids: ["launch"], count: 1 } },
  reactor: { id: "reactor", title: "REACTOR SABOTAGE", description: "냉각·보안을 해제하거나 장갑과 후방 핵심부를 직접 돌파하세요.",
    profiles: ["standard", "large", "expanded"], defaultProfile: "large", minutes: 22,
    nodes: [node("cooling", "냉각 설비 파괴", "cooling", "destroy", 260, [], { required: false, public: true }),
      node("security", "보호 전력 차단", "power", "interact", 2, [], { required: false, public: true }),
      node("reactor", "원자로 핵심부 파괴", "reactor", "destroy", 420, ["cooling", "security"],
        { prerequisiteMode: "any", activation: "breach", public: true }), ...optional()],
    completion: { ids: ["reactor"], count: 1 } },
  transfer: { id: "transfer", title: "INTELLIGENCE TRANSFER", description: "인증 후 데이터 케이스를 다른 기지로 운반·전송하세요. 운반 중에는 권총을 사용합니다.",
    profiles: ["large", "expanded"], defaultProfile: "large", minutes: 26,
    nodes: [node("auth", "보안 인증 확보", "command", "interact", 2),
      node("case", "데이터 저장 장치 회수", "archive", "collect", 0.7, ["auth"]),
      node("upload", "통신 기지로 운반·전송", "transmitter", "upload", 14, ["case"]), ...optional()],
    completion: { ids: ["upload"], count: 1 } },
  survey: { id: "survey", title: "GEOLOGICAL SURVEY", description: "두 현장의 장비를 설치·초기화·가동한 뒤 중앙에서 분석하세요.",
    profiles: ["large", "expanded"], defaultProfile: "expanded", minutes: 28,
    nodes: [node("survey-a", "북부 시추 조사", "drill", "drill", 18),
      node("survey-b", "남부 시추 조사", "drill", "drill", 18),
      node("analysis", "중앙 분석 장비 가동", "analyzer", "analyze", 9, ["survey-a", "survey-b"]), ...optional()],
    completion: { ids: ["analysis"], count: 1 } },
  blitz: { id: "blitz", title: "BLITZ DESTRUCTION", description: "생산시설 다섯 곳 중 세 곳을 파괴하고 신속히 철수하세요.",
    profiles: ["standard"], defaultProfile: "standard", minutes: 8,
    nodes: [...Array.from({length:5}, (_,i) => node("factory-"+i, "생산시설 "+String.fromCharCode(65+i), "production", "destroy", 260)), ...optional().slice(0,2)],
    completion: { ids: Array.from({length:5},(_,i)=>"factory-"+i), count: 3 } },
  defense: { id: "defense", title: "PERIMETER DEFENSE", description: "통제 시설을 가동하고 실제 접근하는 유한 공세로부터 지키세요.",
    profiles: ["compact"], defaultProfile: "compact", minutes: 12,
    nodes: [node("defense", "통제 시설 가동·방어", "beacon", "defend", 75), ...optional().filter(n=>["barracks","depot"].includes(n.id))],
    completion: { ids: ["defense"], count: 1 } },
};
export const isMissionId = (v: unknown): v is MissionId => typeof v === "string" && Object.hasOwn(MISSIONS,v);
export const isProfileId = (v: unknown): v is WorldProfileId => typeof v === "string" && Object.hasOwn(WORLD_PROFILES,v);
export interface OperationOptions { missionId: MissionId; profile: WorldProfileId; deployment: number; generatorVersion: 42; }
export function operationOptions(id: MissionId, profile?: WorldProfileId, deployment = 0): OperationOptions {
  const spec = MISSIONS[id];
  if (!spec || (profile && !spec.profiles.includes(profile))) throw Error("지원하지 않는 미션/맵 규모 조합");
  if (!Number.isInteger(deployment) || deployment < 0 || deployment > 2) throw Error("유효하지 않은 투입 지점");
  return { missionId:id, profile:profile ?? spec.defaultProfile, deployment, generatorVersion:42 };
}
