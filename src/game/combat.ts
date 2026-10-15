import {type World,type Enemy,type Player,type Vec,type WeaponId,type HitQuality,type PartId,type Installation} from '../shared/data';
import {armorAt,ensureComponents,penetrationMultiplier,type ArmoredTarget,type RayHit} from './armor';
import {event} from './simulation';
import {hurtEnemy} from './projectiles';
import {raiseAlert} from './alert';
import {distance,invalidateNavigation} from './map';
export interface DamageProfile {normal:number;durable:number;ap:number;falloff?:number;scale?:number}
/** Shared and ordered: AP/AV -> normal/durable blend -> range -> attack scale -> weak multiplier -> main contribution. */
export function resolveDamage(a:DamageProfile,av:number,durability:number,weak=1){return penetrationMultiplier(a.ap,av)*(a.normal*(1-durability)+a.durable*durability)*(a.falloff??1)*(a.scale??1)*weak;}
export function applyHit(w:World,t:ArmoredTarget,hit:RayHit,a:DamageProfile,owner?:Player,weapon?:WeaponId){
 if(t.hp<=0)return {damage:0,quality:'ricochet' as HitQuality,part:hit.region.id};
 ensureComponents(t);const part=armorAt(t,hit.region,hit.point),multi=penetrationMultiplier(a.ap,part.av),raw=resolveDamage(a,part.av,part.durability,part.weak),component=t.components?.[part.id];
 let componentBroken=false,applied=raw;
 const componentDamage=component&&!component.destroyed?Math.min(component.hp,raw):0;
 if(component&&!component.destroyed){component.hp=Math.max(0,component.hp-raw);if(component.hp===0){component.destroyed=true;componentBroken=true;}}
 const main=applied*part.contribution;
 if('maxHp'in t){
  localDefense(w,t);if(raw>0){t.hp=Math.max(0,t.hp-main);if(t.hp===0){invalidateNavigation(w.map);w.terrainRevision++;}}
 }else{
  hurtEnemy(w,t,main,owner);
  if(main>0){t.hurt=.18;if(!['walker','juggernaut','artillery'].includes(t.kind))t.stagger=Math.max(t.stagger,weapon==='sg'?.18:weapon==='smg'?.025:.055);}
 }
 const quality:HitQuality=componentBroken?'component':multi===0?'ricochet':part.id==='core'||part.id==='head'?'weakpoint':multi===.65?'partial':'penetration';
 event(w,{type:'hit',x:hit.point.x,y:hit.point.y,actor:owner?.id,weapon,damage:main,quality,part:part.id,target:t.id,armored:quality==='ricochet',heavy:componentBroken,angle:Math.atan2(hit.point.y-(owner?.y??hit.point.y),hit.point.x-(owner?.x??hit.point.x))});
 return {damage:main,quality,part:part.id,componentDamage};
}
function localDefense(w:World,d:Installation){
 if(w.time-(d.attackedAt??-100)<2)return;d.attackedAt=w.time;raiseAlert(w,12,'시설 공격 감지',d,2);
 for(const e of w.enemies){
  if(e.hp<=0||distance(e,d)>600)continue;
  e.reserve=false;e.lastSeen={x:d.x,y:d.y};e.reportKind='heard';e.reportAt=w.time;e.memory=Math.max(e.memory,5);e.state='INVESTIGATE';e.repath=0;
  // Guard's goal is its attacked facility, never an unseen attacker's live position.
 }
}
