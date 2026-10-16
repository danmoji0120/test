import { WORLD_PROFILES, type OperationOptions } from "../shared/missions";
import type { RoomView } from "../shared/data";
import { generateOperationMap } from "./operation-world";
type Brief = NonNullable<RoomView["brief"]>;
const cache = new Map<string, Brief>();
/** Invalid generation is a cached, reviewable lobby error, never an interval exception. */
export function operationBrief(
  seed: number,
  options: OperationOptions,
  difficulty: number,
  count: number,
): Brief {
  const key = JSON.stringify([seed, options, difficulty, count]);
  let result = cache.get(key);
  if (result) return result;
  try {
    const map = generateOperationMap(
      seed,
      options,
      difficulty,
      Math.max(1, count),
    );
    result = {
      width: map.width,
      height: map.height,
      deployments: map.deployments!,
      extractions: map.extractions,
      estimates: map.installations
        .filter(
          (d) => map.missionNodes!.find((n) => n.id === d.objectiveId)?.public,
        )
        .map((d) => ({
          x: Math.round(d.x / 750) * 750,
          y: Math.round(d.y / 750) * 750,
          radius: 550,
          label: map.missionNodes!.find((n) => n.id === d.objectiveId)!.label,
        })),
      signature: map.generation!.signature,
    };
  } catch (e) {
    const profile = WORLD_PROFILES[options.profile];
    result = {
      width: profile.width,
      height: profile.height,
      deployments: [],
      extractions: [],
      estimates: [],
      signature: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
  cache.set(key, result);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return result;
}
