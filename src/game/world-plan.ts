import {
  MISSIONS,
  WORLD_PROFILES,
  type NodeDefinition,
  type OperationOptions,
} from "../shared/missions";
import { validateMissionGraph } from "./mission-graph";
export interface SpatialPlan {
  width: number;
  height: number;
  seed: number;
  sites: NodeDefinition[];
  options: OperationOptions;
}
/** Graph -> space budget -> strategic sites, before any terrain or facility is generated. */
export function spatialPlan(
  seed: number,
  options: OperationOptions,
  difficulty: number,
  players: number,
  attempt = 0,
): SpatialPlan {
  const spec = MISSIONS[options.missionId];
  validateMissionGraph(spec);
  if (!spec.profiles.includes(options.profile))
    throw Error("Unsupported mission/world profile");
  const profile = WORLD_PROFILES[options.profile];
  let folded = seed >>> 0;
  for (const c of `${options.missionId}/${options.profile}/${difficulty}/${players}/42/${attempt}`)
    folded = Math.imul(folded ^ c.charCodeAt(0), 16777619) >>> 0;
  const poiCount =
    options.profile === "expanded" ? 8 : options.profile === "large" ? 4 : 2;
  const pois: NodeDefinition[] = Array.from({ length: poiCount }, (_, i) => ({
    id: "poi-" + i,
    label: [
      "폐허 탄약 창고",
      "적 감시초소",
      "버려진 수송차 보급",
      "야전 정보 저장소",
    ][i % 4],
    role: i % 4 === 1 ? "barracks" : i % 4 === 3 ? "radar" : "supply",
    action: i % 4 === 1 ? "destroy" : i % 4 === 3 ? "radar" : "supply",
    required: false,
    prerequisiteIds: [],
    prerequisiteMode: "all",
    activation: "prerequisites",
    work: i % 4 === 1 ? 220 : 1.5,
    public: false,
    reward: 70,
    response: i % 4 === 1 ? 12 : 3,
    failure: "none",
    effect:
      i % 4 === 1 ? "disable-source" : i % 4 === 3 ? "reveal" : "resupply",
  }));
  return {
    width: profile.width,
    height: profile.height,
    seed: folded,
    sites: [...spec.nodes, ...pois],
    options,
  };
}
