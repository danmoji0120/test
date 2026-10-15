import { RULES } from "../shared/rules";
import "./style.css";
import {
  CHARACTERS,
  WEAPONS,
  MODS,
  emptyInput,
  type CharacterId,
  type WeaponId,
  type ModId,
  type RoomView,
  type Profile,
  type Player,
  type Input,
} from "../shared/data";
import { weaponIcon } from "../art/characters";
import { portrait } from "../art/raster";
import { Renderer } from "./render";
import { AudioEngine } from "./audio";
import { distance, generateMap } from "../game/map";
const app = document.querySelector<HTMLDivElement>("#app")!;
const audio = new AudioEngine();
let socket: WebSocket,
  profile: Profile | null = null,
  id = "",
  room: RoomView | null = null,
  character: CharacterId = "aria",
  weapon: WeaponId = "ar",
  mod: ModId = "none",
  connected = false,
  menu = false,
  help = false,
  renderer: Renderer | null = null,
  signature = "",
  lastPhase = "",
  retry = 0,
  toastTimer = 0;
const keys = new Set<string>();
let mouseDown = false,
  aim = false;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    toast("브라우저 저장이 차단되어 재접속 정보가 유지되지 않습니다.");
  }
}
function send(message: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify(message));
}
function toast(message: string) {
  document.querySelector("#toast")?.remove();
  const el = document.createElement("div");
  el.id = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 4200);
}
function connect() {
  socket = new WebSocket(
    `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
  );
  socket.onopen = () => send({ type: "hello", token: stored("doll-token") });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "hello") {
      id = m.id;
      profile = m.profile;
      save("doll-token", profile!.token);
      connected = true;
      retry = 0;
      room = null;
      signature = "";
      render();
    }
    if (m.type === "profile") {
      profile = m.profile;
      signature = "";
      render();
    }
    if (m.type === "state") {
      room = m.room;
      const me = room?.players.find((p) => p.id === id);
      if (me) {
        character = me.character;
        weapon = me.weapon;
        mod = me.mod;
      }
      render();
    }
    if (m.type === "left") {
      room = null;
      signature = "";
      render();
    }
    if (m.type === "error") toast(m.message);
  };
  socket.onclose = (e) => {
    connected = false;
    keys.clear();
    mouseDown = false;
    signature = "";
    render();
    if (e.code === 4000) {
      toast(
        "다른 탭이 이 오퍼레이터로 연결되었습니다. 별도 브라우저 프로필로 참가하세요.",
      );
      return;
    }
    window.setTimeout(connect, Math.min(5000, 700 + retry++ * 700));
  };
  socket.onerror = () => {};
}
function logo() {
  return `<a class="brand" href="#" aria-label="Doll Squad 홈"><span class="brand-icon">D<span>✦</span></span><span>DOLL SQUAD<small>TACTICAL CO-OP / V2</small></span></a>`;
}
function header() {
  return `<header>${logo()}<nav><span class="nav-active">작전 준비</span><button data-action="help" class="text-button">필드 가이드 <span>↗</span></button></nav><div class="account"><span class="connection ${connected ? "online" : ""}">${connected ? "서버 연결됨" : "재연결 중"}</span><span class="credits">◈ <b>${profile?.credits ?? "—"}</b><small> CR</small></span></div></header>`;
}
function briefing() {
  const map = generateMap(room?.seed ?? 42);
  const plan = `<svg viewBox="0 0 ${map.width} ${map.height}" role="img" aria-label="실제 Seed의 구역 구성"><rect width="${map.width}" height="${map.height}" fill="#172932"/>${map.zones.map((z) => `<rect x="${z.x + 45}" y="${z.y + 45}" width="${z.w - 90}" height="${z.h - 90}" fill="${z.kind === "reactor" ? "#42645d" : z.kind === "security" ? "#3c3b51" : "#273e46"}"/>`).join("")}${map.obstacles.map((o) => `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#75949a" opacity=".65"/>`).join("")}<polyline points="${map.route.map((i) => `${map.zones[i].center.x},${map.zones[i].center.y}`).join(" ")}" fill="none" stroke="#edb4c9" stroke-width="14" stroke-dasharray="30 25"/><circle cx="${map.spawn.x}" cy="${map.spawn.y}" r="65" fill="#8edccc"/><circle cx="${map.extract.x}" cy="${map.extract.y}" r="70" fill="none" stroke="#8edccc" stroke-width="15"/><circle cx="${map.core.x}" cy="${map.core.y}" r="60" fill="#f6d38c"/></svg>`;
  return `<div class="brief-map">${plan}<span>${map.seed} / 12 SECTORS</span></div><div class="brief-body"><div class="eyebrow">OPERATION 001 <span class="tag">1–4인 협동</span></div><h2>BLACKOUT<span class="pink">.</span></h2><p>침묵한 산업지구. 마지막으로 가동 중인<br>적의 동력원을 파괴하고 전원 귀환하세요.</p><div class="mission-steps"><span><b>01</b> 전진 돌파</span><span><b>02</b> 시설 파괴</span><span><b>03</b> 탈출</span></div><div class="brief-meta"><span>산업시설 · 야간</span><span>목표 8–10분</span></div></div>`;
}
function lobby() {
  const c = CHARACTERS[character],
    me = room?.players.find((p) => p.id === id);
  return `${header()}<main class="lobby"><div class="page-heading"><div><div class="eyebrow">NORTHSTAR CONTRACT / 07</div><h1>다음 작전, 준비됐나요<span class="pink">?</span></h1></div><div class="record">${profile?.wins ?? 0}<small> 작전 성공</small><span> / </span>${profile?.runs ?? 0}<small> 출격</small></div></div><div class="lobby-grid"><section class="operator-panel" style="--accent:${c.color}"><div class="operator-top"><span class="eyebrow">YOUR OPERATOR</span><span class="tag">${character === "aria" ? "ASSAULT" : "SUPPORT"}</span></div><div class="portrait-wrap"><span class="portrait-type">${c.callsign}</span><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="portrait-art">${portrait(character)}</div><span class="serial">DS—${character === "aria" ? "01" : "02"} / ACTIVE</span><span class="portrait-cross">＋</span></div><div class="operator-caption"><div class="eyebrow">${c.role}</div><h2>${c.name} <span>${c.callsign}</span></h2><p>“${c.quote}”</p><div class="trait"><span>✦</span> ${character === "aria" ? "선봉의 발걸음 · 이동속도 +6%" : "침착한 손길 · 소생속도 +35%"}</div></div></section><section class="loadout-panel"><div class="section-title"><h3><span>01</span> 오퍼레이터</h3><span>SELECT OPERATOR</span></div><div class="character-options">${(Object.keys(CHARACTERS) as CharacterId[]).map((k) => `<button class="character-card ${character === k ? "selected" : ""}" data-character="${k}" aria-pressed="${character === k}"><div class="mini-portrait">${portrait(k)}</div><span><b>${CHARACTERS[k].name}</b><small>${k === "aria" ? "돌격형" : "지원형"}</small></span><i>${character === k ? "✓" : "+"}</i></button>`).join("")}</div><div class="section-title weapon-title"><h3><span>02</span> 무장 선택</h3><span>PRIMARY WEAPON</span></div><div class="weapons">${(
    Object.keys(WEAPONS) as WeaponId[]
  )
    .map((k) => {
      const g = WEAPONS[k],
        unlocked = profile?.unlocks.includes(k);
      return `<button class="weapon-card ${weapon === k ? "selected" : ""}" data-weapon="${k}" aria-pressed="${weapon === k}"><div class="weapon-art">${weaponIcon(k)}</div><div><b>${g.name} <small>${g.label}</small></b><p>${g.role}</p><span class="weapon-stats">${g.mag} RND <i>·</i> ${g.range / 100} m${k === "sg" ? " · 10 PELLETS" : ""}</span></div><span class="weapon-select">${!unlocked ? `◈ ${g.price}` : weapon === k ? "●" : "○"}</span></button>`;
    })
    .join(
      "",
    )}</div><div class="mod-row"><label for="mod">무기 개조</label><select id="mod">${Object.entries(
    MODS,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${mod === k ? "selected" : ""}>${v.name}${profile?.mods.includes(k as ModId) ? "" : ` · ${v.price} CR 해금`}</option>`,
    )
    .join(
      "",
    )}</select></div><p class="mod-description">${MODS[mod].description}</p><div class="loadout-note"><span>↗</span><p>팀과 함께라면 더 멀리.<br><small>오사는 없습니다. 쓰러진 동료는 F로 구조하세요.</small></p></div></section><aside class="operation-panel"><section class="briefing">${briefing()}</section><section class="squad-panel"><div class="section-title"><h3>분대 편성 <span>${room?.players.length ?? 0}/4</span></h3>${room ? `<button class="code-button" data-action="copy">${room.code} <span>⧉</span></button>` : "<span>CO-OP READY</span>"}</div>${
    room
      ? `<div class="roster">${Array.from({ length: 4 }, (_, i) => {
          const p = room!.players[i];
          return p
            ? `<div class="squad-member"><span class="member-avatar" style="--accent:${CHARACTERS[p.character].color}">${p.character === "aria" ? "A" : "L"}</span><span><b>${escape(p.name)} ${p.id === room!.host ? "<em>LEAD</em>" : ""}</b><small>${WEAPONS[p.weapon].name} / ${CHARACTERS[p.character].name}</small></span><i class="${p.ready ? "ready" : ""}">${!p.connected ? "연결 끊김" : p.ready ? "준비 완료" : "준비 중"}</i></div>`
            : `<div class="empty-member"><span>＋</span> 코드로 동료 초대</div>`;
        }).join(
          "",
        )}</div><div class="room-settings"><label>SEED <input id="seed" aria-label="작전 시드" type="number" min="0" max="999999" value="${room.seed}" ${room.host !== id ? "disabled" : ""}></label><select id="difficulty" aria-label="난이도" ${room.host !== id ? "disabled" : ""}><option value="normal">일반 작전</option><option value="hard" ${room.difficulty === "hard" ? "selected" : ""}>위험 작전 +30%</option></select></div><div class="deploy-row"><button class="secondary ${me?.ready ? "is-ready" : ""}" data-action="ready">${me?.ready ? "✓ 준비 완료" : "준비하기"}</button><button class="primary" data-action="start" ${room.host !== id || !room.players.filter((p) => p.connected).every((p) => p.ready) ? "disabled" : ""}>출격 <span>↗</span></button></div><button class="leave" data-action="leave">분대 나가기</button>`
      : `<div class="entry-fields"><label for="name">콜사인</label><input id="name" maxlength="14" placeholder="오퍼레이터 이름" value="${escape(stored("doll-name") || "오퍼레이터")}"></div><button class="primary create" data-action="create" ${!connected ? "disabled" : ""}>새 분대 만들기 <span>↗</span></button><div class="join-row"><input id="code" maxlength="5" placeholder="분대 코드" aria-label="분대 코드"><button class="secondary" data-action="join" ${!connected ? "disabled" : ""}>참가</button></div><p class="entry-note">혼자 출격하거나, 코드로 친구들과 함께하세요.</p>`
  }</section></aside></div></main><footer><span><i></i> PROJECT DOLL SQUAD <span class="muted">/ FIRST DEPLOYMENT</span></span><span>작게 귀엽게, 빠르고 위험하게.</span><button class="text-button" data-action="audio">${audio.volume ? "◖ 사운드 켜짐" : "◖ 사운드 꺼짐"}</button></footer>`;
}
function combat() {
  return `<canvas id="battle" aria-label="BLACKOUT 전투 화면"></canvas><div class="battle-hud"><div class="battle-top"><div class="battle-logo">${logo()}</div><div class="objective"><div class="eyebrow">OPERATION BLACKOUT <span id="clock"></span></div><h3 id="objective-title"></h3><div class="objective-progress"><span id="objective-bar"></span></div><p id="objective-detail"></p></div><button class="menu-button" data-action="menu">ESC <span>메뉴</span></button></div><div id="team-hud"></div><div id="interaction"></div><div class="battle-bottom"><div class="health-panel"><div class="hud-portrait">${portrait(character)}</div><div><div class="eyebrow">${CHARACTERS[character].callsign} / ${CHARACTERS[character].role}</div><div class="health-number"><b id="hp">100</b><span> / 100</span></div><div class="health-bar"><span id="health-fill"></span></div></div></div><div class="battle-controls"><span><kbd>WASD</kbd> 이동</span><span><kbd>우클릭</kbd> 정밀 조준</span><span><kbd>SHIFT</kbd> 질주</span><span><kbd>TAB</kbd> 현황</span></div><div class="ammo-panel"><div class="eyebrow">${WEAPONS[weapon].name} <span>${WEAPONS[weapon].label}</span></div><div><b id="ammo"></b><span id="reserve"></span></div><small id="reload-label">R · 재장전</small></div></div><div id="radio"><span>COMMS / ${CHARACTERS[character].callsign}</span><p>${CHARACTERS[character].quote}</p></div></div><div id="overlay"></div>`;
}
function result() {
  const m = room!.world!.mission,
    success = m.stage === "success",
    reward = Math.round(m.reward * (room!.difficulty === "hard" ? 1.3 : 1));
  return `${header()}<main class="result-page"><div class="result-portrait">${portrait(character, success ? "happy" : "hurt")}</div><section class="result-card"><div class="eyebrow">OPERATION BLACKOUT / AFTER ACTION REPORT</div><div class="result-seal">${success ? "✦" : "×"}</div><h1>${success ? "모두, 무사히 귀환." : "다음 작전을 기약하며."}</h1><p>${escape(m.reason)}</p><div class="result-grade">${success ? (m.intel ? "S" : "A") : "D"}<span>${success ? "MISSION COMPLETE" : "MISSION FAILED"}</span></div><div class="result-stats"><div><small>작전 시간</small><b>${time(m.elapsed)}</b></div><div><small>분대 처치</small><b>${room!.players.reduce((v, p) => v + p.kills, 0)}</b></div><div><small>기밀 자료</small><b>${m.intel ? "회수 완료" : "미회수"}</b></div></div><div class="reward"><span>획득 크레딧</span><b>+ ${reward} <small>CR</small></b></div><p class="save-note">진행도가 서버에 저장되었습니다 · 현재 ${profile?.credits ?? 0} CR</p><button class="primary" data-action="return" ${room!.host !== id ? "disabled" : ""}>${room!.host === id ? "다음 작전 준비" : "분대장의 복귀를 기다리는 중"} <span>↗</span></button><button class="leave" data-action="leave">분대 나가기</button></section></main>`;
}
function time(s: number) {
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
}
function render() {
  const phase = room?.phase || "lobby";
  if (phase !== lastPhase) {
    menu = false;
    keys.clear();
    mouseDown = false;
    aim = false;
  }
  if (phase === "playing") {
    if (lastPhase !== phase) {
      renderer?.stop();
      app.innerHTML = combat();
      renderer = new Renderer(document.querySelector("#battle")!, audio);
      renderer.localInput = currentInput;
      lastPhase = phase;
      signature = "";
      renderer.start();
    }
    if (room?.world) {
      renderer!.set(room.world, id);
      updateHud();
    }
    if (!connected) showOverlay();
    return;
  }
  const sig = JSON.stringify({
    phase,
    room: room
      ? { ...room, world: phase === "result" ? room.world?.mission : null }
      : null,
    character,
    weapon,
    mod,
    credits: profile?.credits,
    unlocks: profile?.unlocks,
    mods: profile?.mods,
    connected,
  });
  if (sig === signature) return;
  signature = sig;
  renderer?.stop();
  renderer = null;
  lastPhase = phase;
  app.innerHTML = phase === "result" ? result() : lobby();
  if (help) showHelp();
}
function updateHud() {
  if (!room?.world) return;
  const w = room.world,
    p = w.players.find((p) => p.id === id);
  if (!p) return;
  const m = w.mission;
  const current = m.encounters[m.checkpoint];
  const zone = current ? w.map.zones[current.zone] : null;
  const title = {
    infiltrate: "01 / 침투 · 전방 경계선을 뚫으세요",
    breach: "02 / 돌파 · 구역을 확보하며 전진하세요",
    destroy: "03 / 파괴 · 발전 장치 2기를 사격하세요",
    extract: "04 / 탈출 · 분대 전원 추출 구역으로",
    success: "작전 성공",
    failed: "작전 실패",
  }[m.stage];
  document.querySelector("#objective-title")!.textContent = title;
  document.querySelector("#clock")!.textContent = time(m.elapsed);
  const guards = current
    ? w.enemies.filter((e) => e.zone === current.zone).length
    : 0;
  document.querySelector("#objective-detail")!.textContent =
    m.stage === "extract"
      ? `붕괴 경보 ${Math.ceil(m.timer)}초 · 전원 원 안에서 ${RULES.extractSeconds}초 · ${m.extract.toFixed(1)}`
      : m.stage === "destroy"
        ? "파괴하면 60초 탈출 시작 · 동료 위치 확인 후 사격"
        : `${zone?.label ?? "전진"} · ${m.checkpoint + 1} / ${m.encounters.length} 구역 · 적 ${guards} · 지원 ${current ? current.wave + 1 : 0}/${current?.total ?? 0}파`;
  const progress =
    m.stage === "extract"
      ? m.extract / RULES.extractSeconds
      : m.stage === "destroy"
        ? 1 -
          w.map.devices.reduce((n, d) => n + d.hp, 0) /
            w.map.devices.reduce((n, d) => n + d.maxHp, 0)
        : m.checkpoint / m.encounters.length;
  (document.querySelector("#objective-bar") as HTMLElement).style.width =
    Math.min(100, progress * 100) + "%";
  document.querySelector("#hp")!.textContent = String(Math.ceil(p.hp));
  (document.querySelector("#health-fill") as HTMLElement).style.width =
    p.hp + "%";
  document.querySelector("#ammo")!.textContent = String(p.ammo).padStart(
    2,
    "0",
  );
  document.querySelector("#reserve")!.textContent = " / " + p.reserve;
  document.querySelector("#reload-label")!.textContent =
    p.reload > 0 ? `재장전 중 · ${p.reload.toFixed(1)}s` : "R · 재장전";
  document.querySelector("#team-hud")!.innerHTML = w.players
    .filter((p) => p.id !== id)
    .map(
      (p) =>
        `<div class="teammate"><i style="background:${CHARACTERS[p.character].color}"></i><b>${escape(p.name)}</b><span>${!p.connected ? "연결 끊김" : p.down ? "구조 필요" : Math.ceil(p.hp) + " HP"}</span></div>`,
    )
    .join("");
  let hint = p.down
    ? "쓰러졌습니다 · 동료가 F를 길게 눌러 구조할 수 있습니다"
    : "";
  if (!p.down) {
    const fallen = w.players.find((v) => v.down && distance(v, p) < 85);
    if (fallen)
      hint = `F 길게 · ${fallen.name} 소생 ${fallen.reviveProgress.toFixed(1)} / 3`;
    else if (w.map.supplies.some((v) => !v.used && distance(v, p) < 90))
      hint = "E · 보급품 확보 / 주변 분대 체력·탄약 회복";
    else if (!m.intel && distance(p, w.map.intel) < 90)
      hint = `E 길게 · 기밀 자료 회수 ${m.intelProgress.toFixed(1)} / 3`;
    else if (
      w.map.sources.some(
        (s) => !s.disabled && !s.blocked && distance(p, s.entry) < 85,
      )
    )
      hint = "E 길게 · 출동 출입구 봉쇄 / 3초";
    else if (m.stage === "destroy" && distance(p, w.map.core) < 250)
      hint = "좌클릭 · 노출된 발전 장치를 사격해 파괴";
  }
  document.querySelector("#interaction")!.textContent = hint;
  (document.querySelector("#radio") as HTMLElement).style.opacity =
    m.elapsed < 10 ? "1" : "0";
  if (keys.has("Tab") || menu || !connected) showOverlay();
}
function showOverlay() {
  const el = document.querySelector("#overlay");
  if (!el) return;
  if (!connected) {
    el.innerHTML =
      '<div class="modal-backdrop"><div class="modal"><h2>서버에 다시 연결하는 중</h2><p>이동과 사격을 중지했습니다. 같은 오퍼레이터로 자동 복귀합니다.</p></div></div>';
    return;
  }
  if (menu) {
    el.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="eyebrow">FIELD MENU</div><h2>잠깐, 전술을 가다듬고.</h2><p>협동 작전은 메뉴를 열어도 계속 진행됩니다.</p><button class="primary" data-action="menu">작전으로 복귀</button><button class="secondary" data-action="help">조작 가이드</button><button class="secondary" data-action="audio">사운드 ${audio.volume ? "끄기" : "켜기"}</button><button class="leave" data-action="leave">분대 나가기</button></div></div>`;
  } else if (keys.has("Tab")) {
    el.innerHTML = `<div class="status-panel"><div class="eyebrow">SQUAD STATUS / ${room?.code}</div><h2>BLACKOUT</h2><p>SEED ${room?.seed} · 기밀 자료 ${room?.world?.mission.intel ? "회수 완료" : "미회수"}</p>${room?.players.map((p) => `<div class="status-row"><b>${escape(p.name)}</b><span>${WEAPONS[p.weapon].name}</span><span>${p.kills} 처치</span><span>${p.down ? "쓰러짐" : Math.ceil(p.hp) + " HP"}</span></div>`).join("")}</div>`;
  } else el.innerHTML = "";
}
function showHelp() {
  help = true;
  document.querySelector("#help")?.remove();
  const el = document.createElement("div");
  el.id = "help";
  el.className = "modal-backdrop";
  el.innerHTML = `<div class="modal guide"><div class="eyebrow">DOLL SQUAD / FIELD GUIDE</div><h2>함께 들어가서, 함께 돌아오기.</h2><p>분대를 만들고 준비한 뒤 출격하세요. 전방 구역을 돌파하며 계속 전진하세요. 발전실에 도착하면 장치 2기를 직접 사격해 파괴합니다. 붕괴 경보와 추격대가 시작되면 전원 추출 구역으로 이동하세요. E는 보급/자료, F는 동료 구조입니다.</p><div class="guide-grid">${[
    ["W A S D", "이동"],
    ["마우스 · 좌클릭", "조준 · 발사"],
    ["우클릭", "정밀 조준"],
    ["SHIFT", "질주 · 사격 불가"],
    ["R", "재장전"],
    ["E 길게", "목표 · 보급품"],
    ["F 길게", "동료 소생"],
    ["TAB / ESC", "현황 / 메뉴"],
  ]
    .map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`)
    .join(
      "",
    )}</div><p>적의 붉은 조준선은 공격 예고입니다. 엄폐하거나 옆으로 피하세요. 초록색 보급 상자는 근처 동료도 함께 회복합니다. 모든 대원이 쓰러지면 작전이 실패합니다.</p><button class="primary" data-action="close-help">확인, 준비됐어요 <span>↗</span></button></div>`;
  document.body.append(el);
}
document.addEventListener("click", (e) => {
  const button = (e.target as Element).closest<HTMLElement>(
    "[data-action],[data-character],[data-weapon]",
  );
  if (!button || button.hasAttribute("disabled")) return;
  audio.start();
  audio.tone(700, 0.045, 0.055);
  if (button.dataset.character) {
    character = button.dataset.character as CharacterId;
    choose();
    return;
  }
  if (button.dataset.weapon) {
    const k = button.dataset.weapon as WeaponId;
    if (!profile?.unlocks.includes(k)) {
      send({ type: "buy", item: k });
      toast(`${WEAPONS[k].name} 해금 요청 · ${WEAPONS[k].price} CR`);
    } else {
      weapon = k;
      choose();
    }
    return;
  }
  const action = button.dataset.action;
  if (action === "create" || action === "join") {
    const name =
      (document.querySelector("#name") as HTMLInputElement)?.value ||
      "오퍼레이터";
    save("doll-name", name);
    send({
      type: action,
      name,
      character,
      weapon,
      mod,
      code: (document.querySelector("#code") as HTMLInputElement)?.value,
    });
  } else if (action === "ready" || action === "start" || action === "return")
    send({ type: action });
  else if (action === "leave") {
    menu = false;
    send({ type: "leave" });
  } else if (action === "copy") {
    void navigator.clipboard
      ?.writeText(room?.code || "")
      .then(() => toast("분대 코드를 복사했습니다."))
      .catch(() => toast(`분대 코드: ${room?.code}`));
  } else if (action === "help") showHelp();
  else if (action === "close-help") {
    help = false;
    document.querySelector("#help")?.remove();
  } else if (action === "menu") {
    menu = !menu;
    keys.clear();
    mouseDown = false;
    showOverlay();
  } else if (action === "audio") {
    audio.setVolume(audio.volume ? 0 : 0.35);
    save("doll-volume", String(audio.volume));
    signature = "";
    if (room?.phase === "playing") showOverlay();
    else render();
  }
});
function choose() {
  if (room) send({ type: "loadout", character, weapon, mod });
  else {
    signature = "";
    render();
  }
}
document.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "name") save("doll-name", el.value);
});
document.addEventListener("change", (e) => {
  const el = e.target as HTMLSelectElement;
  if (el.id === "mod") {
    const value = el.value as ModId;
    if (!profile?.mods.includes(value)) {
      send({ type: "buy", item: value });
      toast(`${MODS[value].name} 해금 요청 · ${MODS[value].price} CR`);
      el.value = mod;
    } else {
      mod = value;
      choose();
    }
  }
  if (el.id === "seed" || el.id === "difficulty")
    send({
      type: "settings",
      seed: Number((document.querySelector("#seed") as HTMLInputElement).value),
      difficulty: (document.querySelector("#difficulty") as HTMLSelectElement)
        .value,
    });
});
window.addEventListener("keydown", (e) => {
  if ((e.target as Element).matches("input,select")) return;
  if (room?.phase !== "playing") return;
  if (["Tab", "Escape", " ", "Shift"].includes(e.key)) e.preventDefault();
  if (e.key === "Escape" && !e.repeat) {
    menu = !menu;
    mouseDown = false;
    keys.clear();
    showOverlay();
    return;
  }
  keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (e.key === "Tab") showOverlay();
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (e.key === "Tab") showOverlay();
});
window.addEventListener("mousemove", (e) => {
  if (renderer) renderer.mouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener("mousedown", (e) => {
  if (e.target instanceof HTMLCanvasElement && !menu && !help) {
    audio.start();
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) aim = true;
    sendInput();
  }
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) aim = false;
});
window.addEventListener("contextmenu", (e) => {
  if (room?.phase === "playing") e.preventDefault();
});
const release = () => {
  keys.clear();
  mouseDown = false;
  aim = false;
  send({ type: "input", ...emptyInput() });
};
window.addEventListener("blur", release);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) release();
});
window.addEventListener("resize", () => renderer?.resize());
function currentInput(): Input | null {
  if (room?.phase !== "playing" || !renderer || !connected || menu || help)
    return null;
  const p = room.players.find((p) => p.id === id);
  if (!p) return null;
  const cursor = renderer.screenToWorld(renderer.mouse);
  return {
    dx: Number(keys.has("d")) - Number(keys.has("a")),
    dy: Number(keys.has("s")) - Number(keys.has("w")),
    angle: Math.atan2(cursor.y - (p.y - RULES.muzzleHeight), cursor.x - p.x),
    fire: mouseDown,
    aim,
    sprint: keys.has("Shift"),
    reload: keys.has("r"),
    interact: keys.has("e"),
    revive: keys.has("f"),
  };
}
function sendInput() {
  const input = currentInput();
  if (input) send({ type: "input", ...input });
}
setInterval(() => {
  if (currentInput()) sendInput();
  else if (connected) send({ type: "ping" });
}, 1000 / 30);
// Read-only observability used by reproducible browser QA; no state mutation or gameplay shortcuts.
Object.defineProperty(window, "dollQA", {
  get: () => ({
    room,
    id,
    connected,
    frames: renderer?.frames.slice(),
    camera: renderer ? { ...renderer.camera } : null,
    zoom: renderer?.zoom,
  }),
});
if (stored("doll-volume") === "0") audio.setVolume(0);
render();
connect();
