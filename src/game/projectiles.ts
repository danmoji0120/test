import {applyHit} from "./combat";
import {
  type World,
  type Player,
  type Enemy,
  type Vec,
  ENEMIES, CONSUMABLES, WEAPONS, type Projectile,
} from "../shared/data";
import { event, damagePlayer } from "./simulation";
import { distance, wallDistance, visible } from "./map";
import { rayHit, hitRegions, enemyRadius, armored } from "./armor";
import { noise } from "./perception";
import { raiseAlert } from "./alert";
export function hurtEnemy(w: World, e: Enemy, amount: number, owner?: Player) {
  if (e.hp <= 0) return;
  e.hp -= amount;
  e.hurt = 0.18;
  if (e.hp <= 0) {
    if (owner) owner.kills++;
    event(w, {
      type: "kill",
      x: e.x,
      y: e.y,
      actor: owner?.id,
      kind: e.kind,
      heavy: armored(e.kind),
      angle: e.angle,
    });
    if (armored(e.kind)) {
      w.wrecks.push({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        angle: e.angle,
        at: w.time,
      });
      w.wrecks = w.wrecks.slice(-32);
      event(w, { type: "explode", x: e.x, y: e.y, heavy: true });
    }
  }
}
export function launch(
  w: World,
  origin: Vec,
  target: Vec,
  kind: Projectile["kind"],
  owner: string,
  enemy: boolean,
) {
  if (w.projectiles.length >= 96) return;
  const thrown=kind==="frag"||kind==="antiarmor"||kind==="smoke";
  const c=thrown?CONSUMABLES[kind as "frag"|"antiarmor"|"smoke"]:undefined;
  const d = distance(origin, target),
    angle = Math.atan2(target.y - origin.y, target.x - origin.x);
  w.projectiles.push({
    id: "projectile-" + ++w.projectileId,
    kind,
    owner,
    enemy,
    x: origin.x,
    y: origin.y,
    origin: { x: origin.x, y: origin.y },
    target: { x: target.x, y: target.y },
    angle,
    speed: thrown?420:kind === "rocket" ? 850 : kind === "cannon" ? 600 : 0,
    traveled: 0,
    range: kind === "rocket" ? 1050 : d,
    at: w.time,
    impactAt:
      w.time + (thrown?Math.max(.65,d/420)+.25:kind === "mortar" ? 2.6 : d / (kind === "rocket" ? 850 : 600)),
    damage: c?.damage??(kind === "rocket" ? WEAPONS.at.damage : kind === "cannon" ? 24 : 48),
    durableDamage:c?.durableDamage??(kind==="rocket"?WEAPONS.at.durableDamage:24),
    penetration:c?.penetration??(kind==="rocket"?5:2),
    radius: c?.radius??(kind === "rocket" ? 105 : kind === "cannon" ? 52 : 125),
  });
  event(w, {
    type: kind === "mortar"||thrown ? "sound" : "shot",
    toX: origin.x + Math.cos(angle) * 60,
    toY: origin.y + Math.sin(angle) * 60,
    angle,
    cue: kind === "mortar" ? "radio" : "gunfire",
    x: origin.x,
    y: origin.y,
    enemy,
    actor: enemy ? undefined : owner,
    heavy: !thrown,
    weapon:kind==="rocket"?"at":undefined,
  });
  if (kind === "mortar")
    event(w, {
      type: "sound",
      cue: "shell",
      x: target.x,
      y: target.y,
      enemy: true,
      heavy: true,
    });
  noise(w, origin, 1100, "gunfire");
}
/** Removed V4 extra attack. Kept only to reject stale integrations without firing. */
export function fireLauncher(_w: World, _p: Player) { return; }
function explode(w: World, q: World["projectiles"][number]) {
  if(q.kind==="smoke"){
    w.map.smokes??=[];w.map.smokes.push({id:q.id,x:q.x,y:q.y,radius:CONSUMABLES.smoke.radius,until:w.time+CONSUMABLES.smoke.duration});
    w.map.smokes=w.map.smokes.slice(-12);w.terrainRevision++;event(w,{type:"sound",cue:"steps",x:q.x,y:q.y});return;
  }
  const owner = w.players.find((p) => p.id === q.owner);
  if (q.enemy) {
    for (const p of w.players)
      if (
        p.connected &&
        !p.down &&
        distance(p, q) < q.radius &&
        visible(q, p, w.map)
      )
        damagePlayer(
          w,
          p,
          q.damage * Math.max(0.3, 1 - distance(p, q) / q.radius),
        );
  } else {
    for(const t of [...w.enemies,...w.map.installations]){
      if(t.hp<=0)continue;
      const surface=Math.max(0,distance(t,q)-("maxHp"in t?32:enemyRadius(t.kind)));
      if(surface>=q.radius||!visible(q,t,w.map))continue;
      let hit=rayHit(t,q,Math.atan2(t.y-q.y,t.x-q.x),distance(t,q)+150);
      if(q.kind==="rocket"&&q.directTarget===t.id&&q.directPart){const region=hitRegions(t).find(r=>r.id===q.directPart);if(region)hit={point:{x:q.x,y:q.y},distance:0,region};}
      if(!hit)continue;
      applyHit(w,t,hit,{normal:q.damage,durable:q.durableDamage??q.damage,ap:q.penetration??1,
        falloff:q.kind==="rocket"&&q.directTarget===t.id?1:Math.max(.15,1-surface/q.radius),scale:q.kind==="rocket"&&!("maxHp"in t)&&!armored(t.kind)?.22:1},owner,q.kind==="rocket"?"at":undefined);
    }
  }
  event(w, { type: "explode", x: q.x, y: q.y, heavy: true });
  noise(w, q, 1300, "destruction");
}
export function tickProjectiles(w: World, dt: number) {
  const keep: World["projectiles"] = [];
  for (const q of w.projectiles) {
    if (q.kind === "mortar") {
      // Fixed observed coordinate. It never follows a player after launch.
      if (w.time >= q.impactAt) {
        q.x = q.target.x;
        q.y = q.target.y;
        explode(w, q);
      } else {
        const progress = Math.max(
          0,
          Math.min(1, (w.time - q.at) / (q.impactAt - q.at)),
        );
        q.x = q.origin.x + (q.target.x - q.origin.x) * progress;
        q.y = q.origin.y + (q.target.y - q.origin.y) * progress;
        q.traveled = q.range * progress;
        keep.push(q);
      }
      continue;
    }
    const thrown=q.kind==="frag"||q.kind==="antiarmor"||q.kind==="smoke";
    if(thrown&&q.traveled>=q.range-.01){if(w.time>=q.impactAt)explode(w,q);else keep.push(q);continue;}
    const step = Math.min(q.speed * dt, q.range - q.traveled),
      wall = wallDistance(q, q.angle, step, w.map),
      dir = { x: Math.cos(q.angle), y: Math.sin(q.angle) };
    let travel = wall,
      contact = false;
    const actors = q.enemy
      ? w.players.filter((p) => p.connected && !p.down)
      : [
          ...w.enemies.filter((e) => e.hp > 0),
          ...w.map.installations.filter((d) => d.hp > 0),
        ];
    for (const a of actors) {
      if("maxHp"in a||"kind"in a){
        const hit=rayHit(a as Enemy,q,q.angle,travel);
        if(hit){travel=hit.distance;contact=true;q.directTarget=a.id;q.directPart=hit.region.id;}
      }else{
        const dx=a.x-q.x,dy=a.y-q.y,along=dx*dir.x+dy*dir.y,perp=Math.abs(dx*dir.y-dy*dir.x),r=16;
        if(along>=0&&perp<r){const hit=Math.max(0,along-Math.sqrt(r*r-perp*perp));if(hit<=travel){travel=hit;contact=true;}}
      }
    }
    q.x += dir.x * travel;
    q.y += dir.y * travel;
    q.traveled += travel;
    if(contact||wall<step-.01||q.traveled>=q.range-.01){
      if(thrown){q.range=q.traveled;if(w.time>=q.impactAt)explode(w,q);else keep.push(q);}
      else explode(w,q);
    }else keep.push(q);
  }
  w.projectiles = keep;
  w.wrecks = w.wrecks.filter((r) => w.time - r.at < 180);
}
