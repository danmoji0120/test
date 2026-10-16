import {
  MISSIONS,
  WORLD_PROFILES,
  operationOptions,
  type MissionId,
  type WorldProfileId,
} from "../shared/missions";
import { operationGoal } from "../shared/operation";
import { TacticalMap } from "./tactical-map";
import { equipmentIcon } from "../art/equipment";
import { RULES } from "../shared/rules";
import { difficulty } from "../shared/difficulty";
import { unpackRoom } from "../shared/snapshot";
import "./style.css";
import {
  PRIMARY_IDS,
  CONSUMABLES,
  type ConsumableId,
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
const tacticalMap = new TacticalMap();
let socket: WebSocket,
  profile: Profile | null = null,
  id = "",
  room: RoomView | null = null,
  character: CharacterId = "aria",
  weapon: WeaponId = "ar",
  mod: ModId = "none",
  consumable: ConsumableId = "antiarmor",
  selectedSlot: 1 | 2 | 3 = 1,
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
      character =
        profile?.character && Object.hasOwn(CHARACTERS, profile.character)
          ? profile.character
          : "aria";
      weapon = profile?.loadout?.primary ?? "ar";
      consumable = profile?.loadout?.consumable ?? "antiarmor";
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
      room = unpackRoom(m.room, room);
      const me = room?.players.find((p) => p.id === id);
      if (me) {
        character = me.character;
        weapon = me.primary ?? me.weapon;
        mod = me.mod;
        consumable = me.consumable || "antiarmor";
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
  return `<a class="brand" href="#" aria-label="Doll Squad 홈"><span class="brand-icon">D<span>✦</span></span><span>DOLL SQUAD<small>OPERATIONAL MISSIONS / V4.2</small></span></a>`;
}
function header() {
  return `<header>${logo()}<nav><span class="nav-active">작전 준비</span><button data-action="help" class="text-button">필드 가이드 <span>↗</span></button></nav><div class="account"><span class="connection ${connected ? "online" : ""}">${connected ? "서버 연결됨" : "재연결 중"}</span><span class="credits">◈ <b>${profile?.credits ?? "—"}</b><small> CR</small></span></div></header>`;
}
function briefing() {
  const options = room?.operation ?? operationOptions("reactor"),
    spec = MISSIONS[options.missionId],
    b = room?.brief;
  const diagram = b
    ? `<svg viewBox="0 0 ${b.width} ${b.height}" role="img" aria-label="공개된 작전 개요">${b.estimates.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${p.radius}" fill="#e9bf6b20" stroke="#e9bf6b" stroke-width="25"/>`).join("")}${b.deployments.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${i === options.deployment ? 140 : 95}" fill="${i === options.deployment ? "#92e7cc" : "#587b78"}"/>`).join("")}${b.extractions.map((p) => `<rect x="${p.x - 70}" y="${p.y - 70}" width="140" height="140" fill="none" stroke="#9ce2ca" stroke-width="25"/>`).join("")}</svg>`
    : "<p>분대 생성 후 투입 후보를 검토하세요</p>";
  const profile = WORLD_PROFILES[options.profile];
  return `<div class="brief-map">${diagram}<span>${room?.seed ?? 42} / 추정 목표 구역 · 적 위치 비공개</span></div><div class="brief-body"><div class="eyebrow">BARREN FRONTIER <span class="tag">1–4인 협동</span></div><h2>${spec.title}<span class="pink">.</span></h2><p>${b?.error ? escape(b.error) : spec.description}</p><div class="brief-meta"><span>${profile.width} × ${profile.height} · ${profile.label}</span><span>제한 ${spec.minutes}분 · 적 전멸 불필요</span></div></div>`;
}
function missionSettings() {
  const o = room?.operation ?? operationOptions("reactor"),
    locked = room?.host !== id ? "disabled" : "";
  return `<div class="operation-settings"><label>작전<select id="mission" aria-label="미션 유형" ${locked}>${Object.values(
    MISSIONS,
  )
    .map(
      (m) =>
        `<option value="${m.id}" ${o.missionId === m.id ? "selected" : ""}>${m.title}</option>`,
    )
    .join(
      "",
    )}</select></label><label>규모<select id="world-profile" aria-label="월드 규모" ${locked}>${MISSIONS[o.missionId].profiles.map((p) => `<option value="${p}" ${o.profile === p ? "selected" : ""}>${WORLD_PROFILES[p].label} · ${WORLD_PROFILES[p].width}×${WORLD_PROFILES[p].height}</option>`).join("")}</select></label><label>공동 투입<select id="deployment" aria-label="투입 지점" ${locked}>${[0, 1, 2].map((i) => `<option value="${i}" ${o.deployment === i ? "selected" : ""}>투입 ${i + 1}${i === 0 ? " · 기본 접근" : " · 우회 접근"}</option>`).join("")}</select></label></div>`;
}
function lobby() {
  const c = CHARACTERS[character],
    me = room?.players.find((p) => p.id === id);
  return `${header()}<main class="lobby"><div class="page-heading"><div><div class="eyebrow">NORTHSTAR CONTRACT / 07</div><h1>다음 작전, 준비됐나요<span class="pink">?</span></h1></div><div class="record">${profile?.wins ?? 0}<small> 작전 성공</small><span> / </span>${profile?.runs ?? 0}<small> 출격</small></div></div><div class="lobby-grid"><section class="operator-panel" style="--accent:${c.color}"><div class="operator-top"><span class="eyebrow">YOUR OPERATOR</span><span class="tag">${character === "aria" ? "ASSAULT" : "SUPPORT"}</span></div><div class="portrait-wrap"><span class="portrait-type">${c.callsign}</span><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="portrait-art">${portrait(character)}</div><span class="serial">DS—${character === "aria" ? "01" : "02"} / ACTIVE</span><span class="portrait-cross">＋</span></div><div class="operator-caption"><div class="eyebrow">${c.role}</div><h2>${c.name} <span>${c.callsign}</span></h2><p>“${c.quote}”</p><div class="trait"><span>✦</span> ${character === "aria" ? "선봉의 발걸음 · 이동속도 +6%" : "침착한 손길 · 소생속도 +35%"}</div></div></section><section class="loadout-panel"><div class="section-title"><h3><span>01</span> 오퍼레이터</h3><span>SELECT OPERATOR</span></div><div class="character-options">${(Object.keys(CHARACTERS) as CharacterId[]).map((k) => `<button class="character-card ${character === k ? "selected" : ""}" data-character="${k}" aria-pressed="${character === k}"><div class="mini-portrait">${portrait(k)}</div><span><b>${CHARACTERS[k].name}</b><small>${k === "aria" ? "돌격형" : "지원형"}</small></span><i>${character === k ? "✓" : "+"}</i></button>`).join("")}</div><div class="section-title weapon-title"><h3><span>02</span> 무장 선택</h3><span>PRIMARY WEAPON</span></div><div class="weapons">${PRIMARY_IDS.map(
    (k) => {
      const g = WEAPONS[k],
        unlocked = profile?.unlocks.includes(k);
      return `<button class="weapon-card ${weapon === k ? "selected" : ""}" data-weapon="${k}" aria-pressed="${weapon === k}"><div class="weapon-art">${weaponIcon(k)}</div><div><b>${g.name} <small>${g.label}</small></b><p>${g.role}</p><span class="weapon-stats">AP ${g.penetration} <i>·</i> ${g.mag} RND <i>·</i> ${g.range / 100} m${k === "sg" ? " · 10 PELLETS" : ""}</span></div><span class="weapon-select">${!unlocked ? `◈ ${g.price}` : weapon === k ? "●" : "○"}</span></button>`;
    },
  ).join(
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
    )}</select></div><p class="mod-description">${MODS[mod].description}</p><label class="tactical-select">2 · 부무장 <span class="equipment-choice">${equipmentIcon("pistol")}<select id="secondary" aria-label="부무장"><option value="pistol">P-01 권총 · AP 1 / 12발</option></select></span></label><label class="tactical-select">3 · 소모품 <span class="equipment-choice">${equipmentIcon(consumable)}<select id="consumable" aria-label="소모품">${Object.entries(
    CONSUMABLES,
  )
    .map(
      ([k, c]) =>
        `<option value="${k}" ${consumable === k ? "selected" : ""}>${c.name} ×${c.max} · ${c.role}</option>`,
    )
    .join(
      "",
    )}</select></span></label><div class="loadout-note"><span>↗</span><p>팀과 함께라면 더 멀리.<br><small>오사는 없습니다. 쓰러진 동료는 F로 구조하세요.</small></p></div></section><aside class="operation-panel"><section class="briefing">${briefing()}</section><section class="squad-panel"><div class="section-title"><h3>분대 편성 <span>${room?.players.length ?? 0}/4</span></h3>${room ? `<button class="code-button" data-action="copy">${room.code} <span>⧉</span></button>` : "<span>CO-OP READY</span>"}</div>${
    room
      ? `<div class="roster">${Array.from({ length: 4 }, (_, i) => {
          const p = room!.players[i];
          return p
            ? `<div class="squad-member"><span class="member-avatar" style="--accent:${CHARACTERS[p.character].color}">${p.character === "aria" ? "A" : "L"}</span><span><b>${escape(p.name)} ${p.id === room!.host ? "<em>LEAD</em>" : ""}</b><small>${WEAPONS[p.primary ?? p.weapon].name} / P-01 / ${CONSUMABLES[p.consumable].name}</small></span><i class="${p.ready ? "ready" : ""}">${!p.connected ? "연결 끊김" : p.ready ? "준비 완료" : "준비 중"}</i></div>`
            : `<div class="empty-member"><span>＋</span> 코드로 동료 초대</div>`;
        }).join(
          "",
        )}</div>${missionSettings()}<div class="room-settings"><label>SEED <input id="seed" aria-label="작전 시드" type="number" min="0" max="999999" value="${room.seed}" ${room.host !== id ? "disabled" : ""}></label><select id="contract" aria-label="계약" ${room.host !== id ? "disabled" : ""}><option value="blackout">기본 계약</option><option value="recon" ${room.contract === "recon" ? "selected" : ""}>선택 목표 보너스</option></select><select id="difficulty" aria-label="난이도" ${room.host !== id ? "disabled" : ""}>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${room!.difficulty === i + 1 ? "selected" : ""}>${i + 1} · ${i < 2 ? "입문" : i < 4 ? "보통" : i < 6 ? "어려움" : i < 9 ? "극한" : "절망"}</option>`).join("")}</select></div><div class="deploy-row"><button class="secondary ${me?.ready ? "is-ready" : ""}" data-action="ready">${me?.ready ? "✓ 준비 완료" : "준비하기"}</button><button class="primary" data-action="start" ${room.host !== id || !room.players.filter((p) => p.connected).every((p) => p.ready) ? "disabled" : ""}>출격 <span>↗</span></button></div><button class="leave" data-action="leave">분대 나가기</button>`
      : `<div class="entry-fields"><label for="name">콜사인</label><input id="name" maxlength="14" placeholder="오퍼레이터 이름" value="${escape(stored("doll-name") || "오퍼레이터")}"></div><button class="primary create" data-action="create" ${!connected ? "disabled" : ""}>새 분대 만들기 <span>↗</span></button><div class="join-row"><input id="code" maxlength="5" placeholder="분대 코드" aria-label="분대 코드"><button class="secondary" data-action="join" ${!connected ? "disabled" : ""}>참가</button></div><p class="entry-note">혼자 출격하거나, 코드로 친구들과 함께하세요.</p>`
  }</section></aside></div></main><footer><span><i></i> PROJECT DOLL SQUAD <span class="muted">/ FIRST DEPLOYMENT</span></span><span>작게 귀엽게, 빠르고 위험하게.</span><button class="text-button" data-action="audio">${audio.volume ? "◖ 사운드 켜짐" : "◖ 사운드 꺼짐"}</button></footer>`;
}
function combat() {
  return `<canvas id="battle" aria-label="협동 작전 전투 화면"></canvas><div class="battle-hud"><div class="battle-top"><div class="battle-logo">${logo()}</div><div class="objective"><div class="eyebrow"><span id="mission-name">OPERATION</span> <span id="clock"></span></div><h3 id="objective-title"></h3><div class="objective-progress"><span id="objective-bar"></span></div><p id="objective-detail"></p></div><button class="menu-button" data-action="menu">ESC <span>메뉴</span></button></div><div id="team-hud"></div><div id="interaction"></div><div class="battle-bottom"><div class="health-panel"><div class="hud-portrait">${portrait(character)}</div><div><div class="eyebrow">${CHARACTERS[character].callsign} / ${CHARACTERS[character].role}</div><div class="health-number"><b id="hp">100</b><span> / 100</span></div><div class="health-bar"><span id="health-fill"></span></div></div></div><div class="battle-controls"><span><kbd>WASD</kbd> 이동</span><span><kbd>우클릭</kbd> 정밀 조준</span><span><kbd>SHIFT</kbd> 질주</span><span><kbd>TAB</kbd> 현황</span></div><div class="ammo-panel"><div class="eyebrow" id="equipped-label"></div><div><b id="ammo"></b><span id="reserve"></span></div><small id="reload-label">R · 재장전</small></div></div><div id="response-notice" role="status"></div><div id="radio"><span>COMMS / ${CHARACTERS[character].callsign}</span><p>${CHARACTERS[character].quote}</p></div></div><div id="overlay"></div>`;
}
function result() {
  const m = room!.world!.mission,
    success = m.stage === "success",
    reward = Math.round(m.reward * difficulty(room!.difficulty).reward);
  return `${header()}<main class="result-page"><div class="result-portrait">${portrait(character, success ? "happy" : "hurt")}</div><section class="result-card"><div class="eyebrow">${m.id ? MISSIONS[m.id].title : "OPERATION BLACKOUT"} / AFTER ACTION REPORT</div><div class="result-seal">${success ? "✦" : "×"}</div><h1>${success ? "모두, 무사히 귀환." : "다음 작전을 기약하며."}</h1><p>${escape(m.reason)}</p><p>주 목표 ${m.outcome?.primaryAchieved ? "달성" : "미달성"} · 생존 귀환 ${success ? "완료" : "실패"}</p><div class="result-grade">${success ? (m.intel ? "S" : "A") : "D"}<span>${success ? "MISSION COMPLETE" : "MISSION FAILED"}</span></div><div class="result-stats"><div><small>작전 시간</small><b>${time(m.elapsed)}</b></div><div><small>분대 처치</small><b>${room!.players.reduce((v, p) => v + p.kills, 0)}</b></div><div><small>기밀 자료</small><b>${m.intel ? "회수 완료" : "미회수"}</b></div></div><div class="reward"><span>획득 크레딧</span><b>+ ${reward} <small>CR</small></b></div><p class="save-note">진행도가 서버에 저장되었습니다 · 현재 ${profile?.credits ?? 0} CR</p><button class="primary" data-action="return" ${room!.host !== id ? "disabled" : ""}>${room!.host === id ? "다음 작전 준비" : "분대장의 복귀를 기다리는 중"} <span>↗</span></button><button class="leave" data-action="leave">분대 나가기</button></section></main>`;
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
      selectedSlot = 1;
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
    consumable,
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
  const primary = m.objectives.filter((o) => !o.optional),
    done = primary.filter((o) => o.state === "complete").length,
    x = m.extraction;
  document.querySelector("#objective-title")!.textContent =
    m.stage === "extract"
      ? x.state === "inbound"
        ? "탈출 · 수송기 접근 중"
        : "탈출 · 수송기 도착 / 전원 탑승"
      : x.state === "available"
        ? "주 목표 완료 · 탈출 시점은 분대가 결정"
        : m.id
          ? (operationGoal(w, p, renderer?.trackedObjective)?.label ??
            "정찰 · 가용 목표 탐색")
          : "자유 작전 · 핵심 발전기 " + done + " / 2";
  document.querySelector("#clock")!.textContent =
    time(m.elapsed) + " / " + time(m.timeLimit ?? 1800);
  document.querySelector("#mission-name")!.textContent = m.id
    ? MISSIONS[m.id].title
    : "OPERATION BLACKOUT";
  const notice =
    [...(w.notices || [])]
      .reverse()
      .find((n) => n.text.includes("중장갑") && w.time - n.at < 18) ??
    (w.notices || []).at(-1);
  const noticeEl = document.querySelector("#response-notice") as HTMLElement;
  if (noticeEl) {
    noticeEl.textContent =
      notice && w.time - notice.at < 18
        ? `${notice.text} · ${notice.direction} / 약 ${Math.max(0, Math.ceil(notice.eta - w.time))}초`
        : w.alertState.level === 4
          ? "최고 대응 작전 · 도로와 탈출 접근로를 경계하세요"
          : "";
    noticeEl.classList.toggle("maximum", w.alertState.level === 4);
  }
  const levels = ["평시", "의심", "교전", "비상", "최고 경계"];
  const task = m.objectives
    .filter((o) => o.state === "active" && o.discovered && !o.optional)
    .sort((a, b) => distance(a.position, p) - distance(b.position, p))[0];
  const taskText = task
    ? `${task.phase ?? task.label}${task.phase && ["데이터 수집", "방어 중", "데이터 전송", "분석 중"].includes(task.phase) ? ` · ${Math.floor(task.progress)}/${task.total}초` : ""}`
    : "순서 자유 · TAB 목표 추적 / 적 전멸 불필요";
  document.querySelector("#objective-detail")!.textContent =
    `경보 ${w.alertState.level} · ${levels[w.alertState.level]} · ${w.alertState.reason} / ` +
    (m.stage === "extract"
      ? x.state === "inbound"
        ? `${Math.max(0, Math.ceil(x.eta - w.time))}초 후 도착`
        : `탑승 ${x.boarding.toFixed(1)}/3초 · 철수 ${Math.ceil(x.departure - w.time)}초`
      : x.state === "available"
        ? "후보 지점에서 E로 수송 요청 · 보조 목표 계속 가능"
        : taskText);
  (document.querySelector("#objective-bar") as HTMLElement).style.width =
    (m.stage === "extract"
      ? x.state === "inbound"
        ? Math.min(1, (w.time - x.requested) / (x.eta - x.requested))
        : x.boarding / 3
      : Math.min(
          1,
          m.completion
            ? m.completion.ids.reduce(
                (n, id) =>
                  n +
                  (m.objectives.find((o) => o.id === id)?.state === "complete"
                    ? 1
                    : 0),
                0,
              ) / m.completion.count
            : primary.reduce((n, o) => n + o.progress / o.total, 0) / 2,
        )) *
      100 +
    "%";
  document.querySelector("#hp")!.textContent = String(Math.ceil(p.hp));
  (document.querySelector("#health-fill") as HTMLElement).style.width =
    p.hp + "%";
  document.querySelector("#ammo")!.textContent = String(
    p.activeSlot === 3 ? p.consumableCount : p.ammo,
  ).padStart(2, "0");
  document.querySelector("#reserve")!.textContent =
    p.activeSlot === 3 ? " 개" : " / " + p.reserve;
  document.querySelector("#equipped-label")!.textContent =
    p.activeSlot === 3
      ? `3 · ${CONSUMABLES[p.consumable].name}`
      : `${p.activeSlot} · ${WEAPONS[p.weapon].name} / AP ${WEAPONS[p.weapon].penetration}`;
  document.querySelector("#reload-label")!.textContent =
    p.switching > 0
      ? `전환 중 · ${p.switching.toFixed(1)}s`
      : p.useTime > 0
        ? `사용 준비 · ${p.useTime.toFixed(1)}s`
        : p.reload > 0
          ? `재장전 중 · ${p.reload.toFixed(1)}s`
          : `1 주무장 · 2 권총 · 3 ${CONSUMABLES[p.consumable].name} ${p.consumableCount}`;
  document.querySelector("#team-hud")!.innerHTML = w.players
    .filter((p) => p.id !== id)
    .map(
      (p) =>
        `<div class="teammate"><i style="background:${CHARACTERS[p.character].color}"></i><b>${escape(p.name)}${p.carrying ? " · CASE" : ""}</b><span>${!p.connected ? "연결 끊김" : p.down ? "구조 필요" : Math.ceil(p.hp) + " HP"}</span></div>`,
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
      hint = "E · 보급품 확보 / 체력·주/부무장 탄약·선택 소모품 1개";
    else if (!m.id && !m.intel && distance(p, w.map.intel) < 90)
      hint = `E 길게 · 기밀 자료 회수 ${m.intelProgress.toFixed(1)} / 3`;
    else if (
      w.map.sources.some(
        (s) => !s.disabled && !s.blocked && distance(p, s.entry) < 85,
      )
    )
      hint = "E 길게 · 출동 출입구 봉쇄 / 3초";
    else if (
      m.extraction.state === "available" &&
      w.map.extractions.some((s) => distance(s, p) < 100)
    )
      hint = "E · 수송기 호출 / 도착 후 전원 탑승";
    else if (w.map.installations.some((d) => d.hp > 0 && distance(d, p) < 220))
      hint = "좌클릭 · 시설 장치를 사격해 파괴";
  }
  if (m.id && !p.down) {
    const o = m.objectives.find(
      (o) =>
        o.discovered &&
        o.state !== "complete" &&
        distance(p, o.operatingPoint ?? o.position) < 110,
    );
    if (o)
      hint =
        o.state === "locked"
          ? `잠김 · ${(o.prerequisiteIds ?? []).map((id) => m.objectives.find((n) => n.id === id)?.label ?? "선행 목표").join(o.prerequisiteMode === "any" ? " / " : " + ")}${o.activation === "breach" ? " 또는 장갑 돌파" : " 필요"}`
          : o.action === "destroy"
            ? "시설 공략 · 실제 약점 / AP·AV"
            : `E · ${o.phase ?? o.label} · ${o.progress.toFixed(1)}/${o.total}`;
    if (p.carrying)
      hint = "데이터 운반 중 · 권총/소모품 사용 가능 · X 내려놓기";
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
    const w = room?.world;
    if (!w || !renderer) return;
    if (!el.querySelector("#tactical-map")) {
      el.innerHTML = `<div class="status-panel tactical-panel"><div class="eyebrow">TACTICAL MAP / ${room?.code}</div><h2>${w.mission.id ? MISSIONS[w.mission.id].title : "BLACKOUT"}</h2><canvas id="tactical-map" width="1000" height="560" aria-label="전술 지도"></canvas><div id="tactical-objectives" class="operation-objectives"></div><p>◆ 필수 · ◇ 선택 · 점선은 추정 구역 · 미발견 위치는 표시하지 않습니다</p></div>`;
      tacticalMap.attach(
        el.querySelector("#tactical-map")!,
        () => room?.world ?? undefined,
        (id) => {
          renderer!.trackedObjective = id;
          toast("목표 추적 변경");
        },
      );
    }
    const stateLabel = (o: (typeof w.mission.objectives)[number]) =>
      o.state === "locked"
        ? "잠김"
        : o.state === "complete"
          ? "완료"
          : o.state === "failed"
            ? "실패"
            : (o.phase ??
              (o.discovered
                ? "수행 가능"
                : o.known === "region"
                  ? "추정 구역"
                  : "위치 미확인"));
    el.querySelector("#tactical-objectives")!.innerHTML = w.mission.objectives
      .filter((o) => !o.optional || o.discovered || o.state === "complete")
      .map(
        (o) =>
          `<button class="secondary" data-action="track" data-id="${o.id}">${o.optional ? "◇" : "◆"} ${escape(o.label)} · ${stateLabel(o)}${o.state === "locked" ? `<small>선행 ${(o.prerequisiteIds ?? []).map((id) => escape(w.mission.objectives.find((n) => n.id === id)?.label ?? "미확인")).join(o.prerequisiteMode === "any" ? " / " : " + ")}${o.activation === "breach" ? " 또는 장갑 돌파" : ""}</small>` : ""}</button>`,
      )
      .join("");
    tacticalMap.draw(
      el.querySelector("#tactical-map")!,
      w,
      renderer.fog,
      renderer.trackedObjective,
    );
  } else el.innerHTML = "";
}
function showHelp() {
  help = true;
  document.querySelector("#help")?.remove();
  const el = document.createElement("div");
  el.id = "help";
  el.className = "modal-backdrop";
  el.innerHTML = `<div class="modal guide"><div class="eyebrow">DOLL SQUAD / FIELD GUIDE</div><h2>함께 들어가서, 함께 돌아오기.</h2><p>분대를 만들고 작전 유형·규모·공동 투입 지점을 선택하세요. 미션별 선행 조건과 단계가 다르며 적 전멸은 필요 없습니다. 통신시설과 병영·포병 시설은 실제 지역 대응을 약화시킵니다. 데이터 케이스 운반 중에는 권총과 소모품을 사용하며 X로 내려놓습니다. 주 목표 완료 후 후보 지점에서 E로 수송기를 요청하세요. 도착한 수송기 주변에 전원이 3초 집결하면 귀환합니다. TAB으로 목표를 추적하고, E는 보급·자료·출입구 봉쇄, F는 동료 구조입니다.</p><div class="guide-grid">${[
    ["W A S D", "이동"],
    ["마우스 · 좌클릭", "조준 · 발사"],
    ["우클릭", "정밀 조준"],
    ["SHIFT", "질주 · 사격 불가"],
    ["R", "재장전"],
    ["X", "데이터 케이스 내려놓기"],
    ["1 / 2 / 3", "주무장 / 권총 / 소모품"],
    ["E 길게", "목표 · 보급품"],
    ["F 길게", "동료 소생"],
    ["TAB / ESC", "현황 / 메뉴"],
  ]
    .map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`)
    .join(
      "",
    )}</div><p>장갑의 주황색 후면이 약점입니다. AP보다 높은 장갑은 관통할 수 없습니다. 약점을 노리고, 기관포 예고와 포격 원을 피해 이동하세요. 진압병의 과열은 우회 기회입니다. 초록색 보급 상자는 근처 동료도 함께 회복합니다. 모든 대원이 쓰러지면 작전이 실패합니다.</p><button class="primary" data-action="close-help">확인, 준비됐어요 <span>↗</span></button></div>`;
  document.body.append(el);
}
document.addEventListener("click", (e) => {
  const track = (e.target as HTMLElement).closest<HTMLElement>(
    '[data-action="track"]',
  );
  if (track && renderer) {
    renderer.trackedObjective = track.dataset.id ?? "";
    toast("목표 추적 변경");
    return;
  }
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
      operation: action === "create" ? operationOptions("reactor") : undefined,
      name,
      character,
      weapon,
      mod,
      loadout: { primary: weapon, secondary: "pistol", consumable },
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
  if (room)
    send({
      type: "loadout",
      character,
      mod,
      loadout: { primary: weapon, secondary: "pistol", consumable },
    });
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
  if (el.id === "consumable") {
    consumable = el.value as ConsumableId;
    choose();
  }
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
  if (["mission", "world-profile", "deployment"].includes(el.id)) {
    const mission = (document.querySelector("#mission") as HTMLSelectElement)
      .value as MissionId;
    const size =
      el.id === "mission"
        ? MISSIONS[mission].defaultProfile
        : ((document.querySelector("#world-profile") as HTMLSelectElement)
            .value as WorldProfileId);
    send({
      type: "settings",
      operation: operationOptions(
        mission,
        size,
        Number(
          (document.querySelector("#deployment") as HTMLSelectElement).value,
        ),
      ),
    });
  }
  if (el.id === "seed" || el.id === "difficulty" || el.id === "contract")
    send({
      type: "settings",
      contract: (document.querySelector("#contract") as HTMLSelectElement)
        .value,
      seed: Number((document.querySelector("#seed") as HTMLInputElement).value),
      difficulty: Number(
        (document.querySelector("#difficulty") as HTMLSelectElement).value,
      ),
    });
});
window.addEventListener("keydown", (e) => {
  if ((e.target as Element).matches("input,select")) return;
  if (e.key === "1" || e.key === "2" || e.key === "3")
    selectedSlot = Number(e.key) as 1 | 2 | 3;
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
  if (e.key === "Tab") {
    mouseDown = false;
    aim = false;
    send({ type: "input", ...emptyInput() });
    showOverlay();
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (e.key === "Tab") showOverlay();
});
window.addEventListener("mousemove", (e) => {
  if (renderer && !keys.has("Tab") && !menu && !help)
    renderer.mouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener("mousedown", (e) => {
  if (e.target === renderer?.canvas && !menu && !help && !keys.has("Tab")) {
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
  if (
    room?.phase !== "playing" ||
    !renderer ||
    !connected ||
    menu ||
    help ||
    keys.has("Tab")
  )
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
    drop: keys.has("x"),
    slot: selectedSlot,
    targetX: cursor.x,
    targetY: cursor.y + RULES.muzzleHeight,
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
    terrain: renderer?.terrainChunks.stats(),
    tactical: { zoom: tacticalMap.zoom, pan: { ...tacticalMap.pan } },
    camera: renderer ? { ...renderer.camera } : null,
    zoom: renderer?.zoom,
  }),
});
if (stored("doll-volume") === "0") audio.setVolume(0);
render();
connect();
