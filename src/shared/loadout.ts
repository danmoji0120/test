import {WEAPONS,PRIMARY_IDS,CONSUMABLES,type PrimaryId,type ConsumableId,type Loadout,type Profile,type Player,type GunState} from './data';
export const isPrimary=(id:unknown):id is PrimaryId=>PRIMARY_IDS.includes(id as PrimaryId);
export const isConsumable=(id:unknown):id is ConsumableId=>typeof id==='string'&&Object.hasOwn(CONSUMABLES,id);
export const defaultLoadout=():Loadout=>({primary:'ar',secondary:'pistol',consumable:'antiarmor'});
/** A legacy tactical launcher never replaces the selected primary. No legacy extra rockets survive. */
export function migrateLoadout(value:any,unlocks:readonly string[]):Loadout{
 const primary=isPrimary(value?.primary)?value.primary:isPrimary(value?.weapon)?value.weapon:'ar';
 return {primary:unlocks.includes(primary)?primary:'ar',secondary:'pistol',consumable:isConsumable(value?.consumable)?value.consumable:'antiarmor'};
}
export function validateLoadout(value:any,profile:Profile):Loadout|null{
 if(!value||!isPrimary(value.primary)||!profile.unlocks.includes(value.primary)||value.secondary!=='pistol'||!isConsumable(value.consumable))return null;
 return {primary:value.primary,secondary:'pistol',consumable:value.consumable};
}
export const gunState=(id:keyof typeof WEAPONS):GunState=>({id,ammo:WEAPONS[id].mag,reserve:WEAPONS[id].reserve,reload:0,cooldown:0,recoil:0});
export function resetEquipment(p:Player){
 p.primary=isPrimary(p.weapon)?p.weapon:p.primary||'ar';p.secondary='pistol';p.consumable=isConsumable(p.consumable)?p.consumable:'antiarmor';
 p.guns={primary:gunState(p.primary),secondary:gunState('pistol')};p.activeSlot=1;p.switching=0;p.useTime=0;p.useCooldown=0;p.fireHeld=false;p.useTarget=null;p.consumableCount=CONSUMABLES[p.consumable].max;
 delete p.tactical;delete p.rockets;delete p.tacticalCooldown;loadActive(p);
}
export const activeGun=(p:Player)=>p.activeSlot===2?p.guns.secondary:p.guns.primary;
/** Legacy flat HUD fields mirror the equipped gun; only simulation writes them. */
export function saveActive(p:Player){if(p.activeSlot===3)return;Object.assign(activeGun(p),{ammo:p.ammo,reserve:p.reserve,reload:p.reload,cooldown:p.cooldown,recoil:p.recoil});}
export function loadActive(p:Player){const g=activeGun(p);p.weapon=g.id;p.ammo=g.ammo;p.reserve=g.reserve;p.reload=g.reload;p.cooldown=g.cooldown;p.recoil=g.recoil;}
export function equip(p:Player,slot:1|2|3){
 if(p.activeSlot===slot||p.switching>0||p.useTime>0)return false;
 saveActive(p);if(p.activeSlot!==3)activeGun(p).reload=0; // Holstering cancels reload; spent time is lost, ammunition is preserved.
 p.activeSlot=slot;loadActive(p);p.switching=slot===3?0.3:WEAPONS[p.weapon].equip;p.useTime=0;p.useTarget=null;return true;
}
