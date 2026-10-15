export function difficulty(level: number, team = 1) {
  const n = Math.max(
    1,
    Math.min(10, Math.round(Number.isFinite(level) ? level : 3)),
  );
  return {
    level: n,
    guardCount: Math.min(16, 6 + Math.floor(n * 0.7) + Math.max(0, team - 1)),
    patrolGroups: n < 3 ? 1 : n < 6 ? 2 : n < 9 ? 3 : 4,
    reaction: n <= 3 ? 1.6 - (n - 1) * 0.3 : 1 - (n - 3) * 0.05,
    aimQuality: 0.42 + n * 0.044,
    aimSpread: 1.25 - n * 0.045,
    interceptLead: 0.35 + n * 0.06,
    guardLeash: n <= 3 ? 240 : 280,
    flank: 0.15 + n * 0.045,
    radio: 380 + n * 65,
    sensitivity: 1,
    prepare: Math.max(0.5, 1.4 - n * 0.1),
    interval: 68 - n * 4.6,
    batch: Math.min(5, 2 + Math.floor(n / 4) + (team >= 3 ? 1 : 0)),
    activeCap: Math.min(30, 9 + n + team * 2),
    heavy: 0.06 + n * 0.025,
    elite: n >= 7 ? (n - 6) * 0.12 : 0,
    patrolPeriod: 160 - n * 9,
    reward: 1 + (n - 1) * 0.08,
  };
}
