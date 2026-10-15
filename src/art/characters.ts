export function weaponIcon(id: string) {
  if(id==="at")return `<svg viewBox="0 0 180 60" fill="none" aria-hidden="true"><path d="M18 16h135v29H18zM8 10h15v40H8zM153 12h18v38h-18z" fill="currentColor" opacity=".85"/><path d="M79 44h14l-5 14H75zM95 8h25v9H95z" fill="currentColor"/></svg>`;
  if(id==="pistol")return `<svg viewBox="0 0 180 60" fill="none" aria-hidden="true"><path d="M42 12h100v16H90l-9 29H58l8-29H42z" fill="currentColor"/></svg>`;
  return `<svg viewBox="0 0 180 60" fill="none" aria-hidden="true"><path d="M12 25h25l10-9h${id === "smg" ? 65 : 90}v5h24v7h-28l-9 11H82l-7 17H61l6-21H42L24 44H12z" fill="currentColor" opacity=".9"/><path d="M80 39h22l8 18H86z" fill="currentColor" opacity=".5"/><path d="M64 8h26v8H64zM103 23h24" stroke="currentColor" stroke-width="4"/></svg>`;
}
