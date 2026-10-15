import {it,expect} from 'vitest';
import {createWorld,makePlayer,spawnEnemy,tick,fire} from '../src/game/simulation';
import {resetEquipment,equip,saveActive,validateLoadout,migrateLoadout} from '../src/shared/loadout';
import {penetrationMultiplier,rayHit,worldPoint,hitRegions,destroyed} from '../src/game/armor';
import {applyHit,resolveDamage} from '../src/game/combat';
import {launch,tickProjectiles,fireLauncher} from '../src/game/projectiles';
import {squadSees,lineOfSight,updateVision} from '../src/game/visibility';
import {visibleWorld} from '../src/server/visibility';
import {perceive} from '../src/game/perception';
import {heavyAI} from '../src/game/heavy-ai';
import {emptyInput,WEAPONS,type EnemyKind} from '../src/shared/data';
import {Store} from '../src/server/store';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
function arena(){const p=makePlayer('p','P'),w=createWorld('combat',42,[p],3);w.enemies=[];w.squads={};w.director.next=1e9;w.map.obstacles=[];w.map.supplies=[];w.map.smokes=[];Object.assign(p,{x:1000,y:1000,angle:0});return {p,w};}
it('exhaustively resolves 36 AP/AV combinations, durability and ordered scale',()=>{
 for(let ap=0;ap<=5;ap++)for(let av=0;av<=5;av++){
  const expected=ap<av?0:ap===av?.65:1;expect(penetrationMultiplier(ap,av)).toBe(expected);
  expect(resolveDamage({normal:100,durable:20,ap,falloff:.5,scale:.8},av,.75,1.5)).toBeCloseTo(expected*40*.5*.8*1.5);
 }
 expect(resolveDamage({normal:100,durable:20,ap:2},3,0)).toBe(0);
});
it('preserves both magazines and reserves and cancels holstered reload without granting ammo',()=>{
 const {p,w}=arena();p.input.fire=true;tick(w,1/30);expect(p.ammo).toBe(29);p.input=emptyInput();p.input.reload=true;tick(w,1/30);expect(p.reload).toBeGreaterThan(0);
 p.input=emptyInput();p.input.slot=2;tick(w,1/30);expect(p.weapon).toBe('pistol');expect(p.guns.primary.ammo).toBe(29);expect(p.guns.primary.reload).toBe(0);
 p.input.fire=true;for(let i=0;i<6;i++)tick(w,1/30);expect(p.ammo).toBeLessThan(12);
 const pistol=p.ammo;p.input=emptyInput();p.input.slot=1;tick(w,1/30);expect(p.ammo).toBe(29);expect(p.guns.secondary.ammo).toBe(pistol);
});
it('rejects slot-switch and legacy-G attacks, and AT occupies the only primary slot',()=>{
 const {p,w}=arena();p.weapon='at';resetEquipment(p);p.input.fire=true;p.input.slot=2;tick(w,1/30);expect(w.projectiles).toHaveLength(0);expect(p.primary).toBe('at');expect(p.guns.primary.id).toBe('at');expect(Object.keys(p.guns)).toEqual(['primary','secondary']);
 p.input.tactical=true;fireLauncher(w,p);expect(w.projectiles).toHaveLength(0);
});
it('validates unlocked loadouts and migrates old tactical without replacing the selected rifle',()=>{
 const profile={unlocks:['ar','smg','at','pistol']} as any;
 expect(validateLoadout({primary:'sg',secondary:'pistol',consumable:'frag'},profile)).toBeNull();
 expect(validateLoadout({primary:'ar',secondary:'at',consumable:'frag'},profile)).toBeNull();
 expect(validateLoadout({primary:'ar',secondary:'pistol',consumable:'made-up'},profile)).toBeNull();
 expect(migrateLoadout({weapon:'smg',tactical:'launcher'},profile.unlocks).primary).toBe('smg');
});
it('loads version1 profiles preserving credits, unlocks, mods, operator metadata and reward history',()=>{
 const dir=mkdtempSync(join(tmpdir(),'v41-save-'));try{
  const p={token:'a'.repeat(48),credits:905,unlocks:['ar','sg'],mods:['none','loader'],runs:9,wins:4,kills:82,settled:['paid'],character:'luna',weapon:'sg',tactical:'launcher'};
  writeFileSync(join(dir,'profiles.json'),JSON.stringify({version:1,profiles:[p]}));const s=new Store(dir),r=s.get(p.token);
  expect(r.credits).toBe(905);expect(r.mods).toContain('loader');expect(r.unlocks).toContain('sg');expect(r.loadout?.primary).toBe('sg');expect((r as any).character).toBe('luna');expect(s.settle(r,'paid',999,true,1)).toBe(false);s.save();expect(new Store(dir).get(p.token).credits).toBe(905);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('a frontal ray cannot select the rear core; off-center weapon module has real shape',()=>{
 const {w}=arena(),e=spawnEnemy(w,{x:1300,y:1000},'walker',{angle:Math.PI})!;
 const front=rayHit(e,{x:1000,y:1000},0,500)!;expect(front.region.id).toBe('body');expect(front.region.av).toBe(5);
 const rear=rayHit(e,{x:1600,y:1000},Math.PI,500)!;expect(rear.region.id).toBe('core');
 const weapon=hitRegions(e).find(r=>r.id==='weapon')!,wp=worldPoint(e,weapon);expect(rayHit(e,worldPoint(e,{x:weapon.x,y:weapon.y-200}),e.angle+Math.PI/2,500)?.region.id).toBe('weapon');
});
it('rear rocket deals 55–70% walker main HP, damages its drive and does not duplicate splash',()=>{
 const {p,w}=arena(),e=spawnEnemy(w,{x:1300,y:1000},'walker',{angle:0})!;
 launch(w,p,e,'rocket',p.id,false);for(let i=0;i<40;i++){w.time+=1/30;tickProjectiles(w,1/30);}
 const dealt=650-e.hp;expect(dealt/650).toBeGreaterThanOrEqual(.55);expect(dealt/650).toBeLessThanOrEqual(.70);expect(destroyed(e,'core')).toBe(true);expect(w.events.filter(x=>x.type==='hit'&&x.target===e.id)).toHaveLength(1);expect(p.hp).toBe(100);
 const before=e.hp;for(let i=0;i<4;i++){p.ammo=30;p.recoil=0;fire(w,p);}expect(e.hp).toBeGreaterThan(100);expect(before-e.hp).toBeLessThan(30);
});
it('destroying a physical weapon module disables cannon firing rather than adding duplicate body damage',()=>{
 const {p,w}=arena(),e=spawnEnemy(w,{x:1400,y:1000},'walker',{angle:0})!;
 const reg=hitRegions(e).find(r=>r.id==='weapon')!,point=worldPoint(e,reg);
 const result=applyHit(w,e,{region:reg,point,distance:0},{normal:200,durable:200,ap:5},p);
 expect(e.hp).toBeCloseTo(650-result.damage);expect(destroyed(e,'weapon')).toBe(true);
 for(let i=0;i<90;i++){w.time+=1/30;heavyAI(w,e,p,1/30);}expect(w.projectiles).toHaveLength(0);
});
it('one held consumable click never consumes multiple charges; release permits another',()=>{
 const {p,w}=arena();p.consumable='medical';resetEquipment(p);p.hp=1;equip(p,3);p.switching=0;p.input.fire=true;tick(w,1/30);
 for(let i=0;i<150;i++)tick(w,1/30);expect(p.consumableCount).toBe(1);expect(p.hp).toBeGreaterThan(60);
 p.input.fire=false;tick(w,1/30);p.hp=30;p.input.fire=true;for(let i=0;i<45;i++)tick(w,1/30);expect(p.consumableCount).toBe(0);
});
it('smoke blocks AI and team observation in both directions, but does not stop physical bullets',()=>{
 const {p,w}=arena(),e=spawnEnemy(w,{x:1400,y:1000},'rifle')!;w.map.smokes=[{id:'s',x:1200,y:1000,radius:110,until:14}];w.terrainRevision++;
 expect(lineOfSight(p,e,w.map)).toBe(false);expect(squadSees(w,e)).toBe(false);expect(perceive(w,e,[p],1/30)).toBeUndefined();expect(visibleWorld(w).enemies).toHaveLength(0);
 const hp=e.hp;p.recoil=0;fire(w,p);expect(e.hp).toBeLessThan(hp);
});
it('supplies are finite and replenish only actual slot ammunition within maxima',()=>{
 const {p,w}=arena();p.ammo=5;p.reserve=0;saveActive(p);p.guns.secondary.reserve=0;p.consumableCount=0;w.map.supplies=[{x:p.x,y:p.y,used:false}];p.input.interact=true;tick(w,1/30);
 expect(p.reserve).toBeGreaterThan(0);expect(p.reserve).toBeLessThanOrEqual(WEAPONS.ar.reserve);expect(p.guns.secondary.reserve).toBeGreaterThan(0);expect(p.consumableCount).toBe(1);expect(p.rockets).toBeUndefined();const count=p.reserve;tick(w,1/30);expect(p.reserve).toBe(count);
});
it('thrown antiarmor hits a real wall and explodes at its stopped location',()=>{
 const {p,w}=arena();w.map.obstacles=[{x:1100,y:900,w:30,h:200,kind:'wall'}];launch(w,p,{x:1250,y:1000},'antiarmor',p.id,false);
 const q=w.projectiles[0];for(let i=0;i<60;i++){w.time+=1/30;tickProjectiles(w,1/30);}expect(q.x).toBeLessThanOrEqual(1100);expect(w.projectiles).toHaveLength(0);expect(w.events.some(e=>e.type==='explode')).toBe(true);
});

it('preserves a clear geometric difference between frontal generator armor and exposed core, and calls actual local guards even on ricochet',()=>{
 const {p,w}=arena(),d=w.map.installations.find(d=>d.kind==='generator')!;Object.assign(d,{x:1300,y:1000,angle:Math.PI,hp:420});
 const guard=spawnEnemy(w,{x:1350,y:1200},'rifle',{reserve:true})!;const front=rayHit(d,p,0,600)!;const first=applyHit(w,d,front,{normal:30,durable:10,ap:2},p);
 expect(first.damage).toBe(0);expect(d.hp).toBe(420);expect(guard.reserve).toBe(false);expect(guard.lastSeen).toEqual({x:d.x,y:d.y});expect(guard.reportKind).toBe('heard');
 const back=rayHit(d,{x:1600,y:1000},Math.PI,600)!;expect(back.region.id).toBe('core');expect(applyHit(w,d,back,{normal:30,durable:10,ap:2},p).damage).toBeGreaterThan(20);
});
it('does not use hidden position or input velocity to update a lost aim observation',async()=>{
 const {updateAim}=await import('../src/game/aim-controller');const {p,w}=arena(),e=spawnEnemy(w,{x:1400,y:1000},'rifle')!;
 w.time=1;updateAim(w,e,p,1/30);const stored=structuredClone(e.aimControl);p.x+=500;p.input.dx=1;w.time=2;updateAim(w,e,undefined,1/30);expect(e.aimControl).toEqual(stored);
});

it('limits walker turret rotation separately from its body heading',async()=>{
 const {updateAim,angleDelta}=await import('../src/game/aim-controller');const {p,w}=arena(),e=spawnEnemy(w,{x:1400,y:1000},'walker',{angle:0,turretAngle:0})!;
 w.time=1;updateAim(w,e,p,1/30);expect(Math.abs(angleDelta(e.turretAngle!,0))).toBeLessThanOrEqual(1.15/30+1e-8);expect(Math.abs(angleDelta(e.angle,0))).toBeLessThanOrEqual(.7/30+1e-8);
});
