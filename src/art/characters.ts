import { equipmentIcon } from "./equipment";
export function weaponIcon(id: string) {
  if (id === "at" || id === "pistol") return equipmentIcon(id);
  return `<svg viewBox="0 0 180 60" fill="none" aria-hidden="true"><path d="M12 25h25l10-9h${id === "smg" ? 65 : 90}v5h24v7h-28l-9 11H82l-7 17H61l6-21H42L24 44H12z" fill="currentColor" opacity=".9"/><path d="M80 39h22l8 18H86z" fill="currentColor" opacity=".5"/><path d="M64 8h26v8H64zM103 23h24" stroke="currentColor" stroke-width="4"/></svg>`;
}
