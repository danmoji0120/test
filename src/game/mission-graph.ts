import type { Objective } from "../shared/data";
import type { MissionDefinition } from "../shared/missions";
export function validateMissionGraph(spec: MissionDefinition) {
  const nodes = new Map(spec.nodes.map(n=>[n.id,n]));
  if (nodes.size !== spec.nodes.length || !nodes.size) throw Error("Duplicate/empty objective IDs");
  const visiting = new Set<string>(), done = new Set<string>();
  function visit(id:string) {
    const n=nodes.get(id); if (!n) throw Error("Unknown prerequisite: "+id);
    if (visiting.has(id)) throw Error("Cyclic mission dependency");
    if (done.has(id)) return;
    if (n.prerequisiteMode === "any" && !n.prerequisiteIds.length) throw Error("Empty ANY condition");
    if (new Set(n.prerequisiteIds).size !== n.prerequisiteIds.length) throw Error("Repeated prerequisite");
    visiting.add(id); n.prerequisiteIds.forEach(visit); visiting.delete(id); done.add(id);
    if (n.required && n.activation !== "breach" && n.prerequisiteIds.some(p=>!nodes.get(p)!.required))
      throw Error("Optional objective accidentally gates required progress");
    if (!Number.isFinite(n.work) || n.work <= 0) throw Error("Invalid workload");
  }
  spec.nodes.forEach(n=>visit(n.id));
  const c=spec.completion;
  if (!Number.isInteger(c.count)||c.count<1||c.count>new Set(c.ids).size||c.ids.some(id=>!nodes.has(id))) throw Error("Impossible completion threshold");
  return true;
}
export function prerequisitesMet(o: Objective, nodes: Objective[]) {
  const ids=o.prerequisiteIds ?? [];
  if (!ids.length) return true;
  const complete=(id:string)=>nodes.find(n=>n.id===id)?.state==="complete";
  return o.prerequisiteMode === "any" ? ids.some(complete) : ids.every(complete);
}
export function updateGraph(nodes: Objective[]) {
  for (const o of nodes) {
    if (o.state!=="locked" && o.state!=="inactive") continue;
    if (prerequisitesMet(o,nodes)) o.state="available";
    else if (o.prerequisiteIds?.length && (o.prerequisiteMode==="any"
      ? o.prerequisiteIds.every(id=>nodes.find(n=>n.id===id)?.state==="failed")
      : o.prerequisiteIds.some(id=>nodes.find(n=>n.id===id)?.state==="failed"))) o.state="failed";
  }
}
export function missionComplete(nodes:Objective[], condition?: {ids:string[];count:number}) {
  return condition ? condition.ids.filter(id=>nodes.find(n=>n.id===id)?.state==="complete").length>=condition.count
    : nodes.filter(o=>!o.optional).every(o=>o.state==="complete");
}
/** Idempotent transition; callers may award/effect only if this returns true. */
export function completeObjective(o:Objective) {
  if (o.state==="complete"||o.state==="failed") return false;
  o.state="complete"; o.progress=o.total; return true;
}
