import { describe,it,expect } from "vitest";
import { MISSIONS, operationOptions } from "../src/shared/missions";
import type { Objective } from "../src/shared/data";
import { completeObjective,missionComplete,prerequisitesMet,updateGraph,validateMissionGraph } from "../src/game/mission-graph";
const nodes=():Objective[]=>MISSIONS.launch.nodes.map(n=>({id:n.id,kind:n.action,label:n.label,position:{x:0,y:0},optional:!n.required,state:n.prerequisiteIds.length?"locked":"available",progress:0,total:n.work,reward:n.reward,discovered:n.public,prerequisiteIds:n.prerequisiteIds,prerequisiteMode:n.prerequisiteMode}));
describe("mission dependency graph",()=>{
 it("validates all six definitions and rejects incompatible profiles/deployments",()=>{
   Object.values(MISSIONS).forEach(validateMissionGraph);
   expect(()=>operationOptions("defense","expanded")).toThrow();
   expect(()=>operationOptions("launch","large",3)).toThrow();
 });
 it("opens parallel ALL prerequisites in either order and completes exactly once",()=>{
   for(const order of [["code","power"],["power","code"]]){
     const n=nodes(),final=n.find(o=>o.id==="launch")!;
     completeObjective(n.find(o=>o.id===order[0])!);updateGraph(n);expect(final.state).toBe("locked");
     completeObjective(n.find(o=>o.id===order[1])!);updateGraph(n);expect(final.state).toBe("available");
     expect(completeObjective(final)).toBe(true);expect(completeObjective(final)).toBe(false);
     expect(missionComplete(n,MISSIONS.launch.completion)).toBe(true);
     expect(n.filter(o=>o.optional).every(o=>o.state!=="complete")).toBe(true);
   }
 });
 it("handles ANY, serial stages and a failed alternative",()=>{
   const n=nodes(),a=n.find(o=>o.id==="code")!,b=n.find(o=>o.id==="power")!,c=n.find(o=>o.id==="launch")!;
   c.prerequisiteMode="any";a.state="failed";updateGraph(n);expect(c.state).toBe("locked");
   completeObjective(b);updateGraph(n);expect(c.state).toBe("available");
   c.prerequisiteMode="all";expect(prerequisitesMet(c,n)).toBe(false);
   c.state="locked";updateGraph(n);expect(c.state).toBe("failed");
 });
 it("requires exactly the threshold without making the remaining facilities mandatory",()=>{
   const n=Array.from({length:5},(_,i)=>({...nodes()[0],id:"factory-"+i}));
   n.slice(0,2).forEach(completeObjective);expect(missionComplete(n,MISSIONS.blitz.completion)).toBe(false);
   completeObjective(n[4]);expect(missionComplete(n,MISSIONS.blitz.completion)).toBe(true);
   const restored=JSON.parse(JSON.stringify(n));expect(missionComplete(restored,MISSIONS.blitz.completion)).toBe(true);
 });
 it("rejects cycles, unknown dependencies, optional gates, empty ANY and impossible thresholds",()=>{
   const edit=(fn:(d:typeof MISSIONS.launch)=>void)=>{const d=structuredClone(MISSIONS.launch);fn(d);expect(()=>validateMissionGraph(d)).toThrow();};
   edit(d=>d.nodes[0].prerequisiteIds=["launch"]);
   edit(d=>d.nodes[0].prerequisiteIds=["missing"]);
   edit(d=>d.nodes[0].required=false);
   edit(d=>d.nodes[0].prerequisiteMode="any");
   edit(d=>d.completion.count=2);
 });
});
