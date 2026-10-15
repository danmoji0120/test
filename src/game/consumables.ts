import {CONSUMABLES,type World,type Player} from '../shared/data';
import {event} from './simulation';
import {launch} from './projectiles';
import {distance,wallDistance} from './map';
/** A held button is latched even during a switch/cooldown. A new click is required to start another item. */
export function tickConsumable(w:World,p:Player,dt:number){
 if(p.useTime>0){
  if(p.down||p.input.sprint||p.input.interact||p.input.revive){p.useTime=0;p.useTarget=null;return;}
  p.useTime=Math.max(0,p.useTime-dt);
  if(p.useTime===0&&p.consumableCount>0){
    p.consumableCount--;const c=CONSUMABLES[p.consumable];p.useCooldown=c.cooldown;
    if(p.consumable==='medical'){p.hp=Math.min(100,p.hp+65);p.hurt=Math.max(p.hurt,2);event(w,{type:'supply',x:p.x,y:p.y,actor:p.id});}
    else if(p.useTarget)launch(w,p,p.useTarget,p.consumable,p.id,false);
    p.useTarget=null;
  }
  return;
 }
 if(p.activeSlot!==3||p.switching>0||p.useCooldown>0||p.consumableCount<=0||!p.input.fire||p.fireHeld||p.input.sprint||p.input.revive||p.input.interact)return;
 if(p.consumable==='medical'&&p.hp>=100)return;
 const c=CONSUMABLES[p.consumable],angle=p.angle;
 const requested={x:p.input.targetX??p.x+Math.cos(angle)*c.range,y:p.input.targetY??p.y+Math.sin(angle)*c.range};
 const r=Math.min(c.range,distance(p,requested));
 const a=Math.atan2(requested.y-p.y,requested.x-p.x),max=Math.max(0,wallDistance(p,a,r,w.map)-3);
 p.useTarget={x:p.x+Math.cos(a)*max,y:p.y+Math.sin(a)*max};p.useTime=c.prepare;
}
export function tickSmoke(w:World){const before=w.map.smokes?.length??0;w.map.smokes=(w.map.smokes??[]).filter(s=>s.until>w.time);if(w.map.smokes.length!==before)w.terrainRevision++;}
