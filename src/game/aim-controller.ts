import {type World,type Enemy,type Player,ENEMIES} from '../shared/data';
import {distance} from './map';
import {difficulty} from '../shared/difficulty';
import {destroyed} from './armor';
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function turn(current:number,target:number,max:number){return current+Math.max(-max,Math.min(max,angleDelta(target,current)));}
const SETTINGS={
 rifle:{turn:5.2,spread:.24,learn:.7},rush:{turn:7,spread:.15,learn:.5},heavy:{turn:2.3,spread:.2,learn:.8},
 juggernaut:{turn:1.5,spread:.18,learn:.8},drone:{turn:8,spread:.14,learn:.6},walker:{turn:1.15,spread:.065,learn:.72},artillery:{turn:.6,spread:.04,learn:.7},
};
/** Reads only a target authorized by perception. Velocity comes from consecutive visible positions, never from player input or a hidden live lookup. */
export function updateAim(w:World,e:Enemy,target:Player|undefined,dt:number){
 const spec=SETTINGS[e.kind];e.turretAngle??=e.angle;
 if(!target)return false;
 let a=e.aimControl;
 if(!a||a.target!==target.id||w.time-a.at>.65){a=e.aimControl={point:{x:target.x,y:target.y},velocity:{x:0,y:0},at:w.time,target:target.id,acquired:w.time+.12*difficulty(w.difficulty).reaction,error:1};}
 else if(w.time>a.at){
  const elapsed=w.time-a.at,v={x:(target.x-a.point.x)/elapsed,y:(target.y-a.point.y)/elapsed},speed=Math.hypot(v.x,v.y),cap=Math.min(1,440/Math.max(1,speed));
  const change=Math.hypot(v.x*cap-a.velocity.x,v.y*cap-a.velocity.y);
  a.velocity.x+=(v.x*cap-a.velocity.x)*.36;a.velocity.y+=(v.y*cap-a.velocity.y)*.36;
  a.error=Math.max(.3,Math.min(1.5,a.error-dt*.7+change/1500));a.point={x:target.x,y:target.y};a.at=w.time;
 }
 const proficiency=(.42+w.difficulty*.044)*(e.elite?1.12:1),flight=e.kind==='walker'?Math.min(1.2,distance(e,a.point)/600):.035;
 const lead=flight*spec.learn*proficiency;
 const desired=Math.atan2(a.point.y+a.velocity.y*lead-e.y,a.point.x+a.velocity.x*lead-e.x);
 const rate=spec.turn*(destroyed(e,'core')?.7:1);
 e.turretAngle=turn(e.turretAngle,desired,rate*dt);
 e.angle=turn(e.angle,e.turretAngle,(e.kind==='walker'||e.kind==='artillery'?.7:3.5)*dt);
 return w.time>=a.acquired&&Math.abs(angleDelta(desired,e.turretAngle))<.3;
}
export function firingAngle(w:World,e:Enemy){
 const s=SETTINGS[e.kind],motion=Math.min(1,Math.hypot(e.aimControl?.velocity.x??0,e.aimControl?.velocity.y??0)/280),error=s.spread*(1.25-w.difficulty*.045)*(e.elite?.8:1)*((e.aimControl?.error??1)+motion*.8);
 w.random=(Math.imul(1664525,w.random)+1013904223)>>>0;
 return (e.turretAngle??e.angle)+(w.random/4294967296-.5)*error;
}
