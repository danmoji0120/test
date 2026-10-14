import type { CharacterId } from "../shared/data";
export type Expression = "normal" | "happy" | "hurt";
export function head(id: CharacterId, expression: Expression = "normal") {
  const pink = id === "aria",
    hair = pink ? "#f5b0cd" : "#ece8ff",
    shade = pink ? "#b85789" : "#aaa0ce",
    light = pink ? "#ffe0eb" : "#fffaff",
    iris = pink ? "#dd668f" : "#817bcd";
  return `<defs><linearGradient id="hair${id}" x2=".8" y2="1"><stop stop-color="${light}"/><stop offset=".65" stop-color="${hair}"/><stop offset="1" stop-color="${shade}"/></linearGradient><linearGradient id="eye${id}" x2="0" y2="1"><stop stop-color="#322b53"/><stop offset=".5" stop-color="${iris}"/><stop offset="1" stop-color="${pink ? "#ffc3d7" : "#bee6ff"}"/></linearGradient></defs>
${pink ? `<path d="M58 69Q11 66 16 143L4 193Q41 191 62 160L67 100M161 68Q204 56 204 130L217 191Q176 189 163 152Z" fill="url(#hair${id})" stroke="${shade}" stroke-width="3"/><path d="M28 99Q19 145 26 173M190 90Q187 137 200 167" fill="none" stroke="${light}" stroke-width="4"/>` : `<path d="M38 92Q31 171 37 200Q76 219 112 202Q152 215 185 195L181 99Z" fill="url(#hair${id})" stroke="${shade}" stroke-width="3"/><path d="M44 144L49 191M178 141L169 194" stroke="${light}" stroke-width="4"/>`}
<path d="M46 91Q44 37 108 31Q173 26 183 91L175 145Q153 172 111 177Q69 174 48 144Z" fill="url(#hair${id})" stroke="#38344e" stroke-width="3"/>
<ellipse cx="48" cy="123" rx="9" ry="14" fill="#ffdccf"/><ellipse cx="178" cy="123" rx="9" ry="14" fill="#ffdccf"/>

<path d="M52 91Q65 59 110 64Q162 60 174 94L171 130Q165 160 113 169Q65 159 55 133Z" fill="#ffe9df"/>
<path d="M64 99Q76 93 89 97M135 97Q149 93 163 99" stroke="${shade}" stroke-width="3" fill="none" stroke-linecap="round"/>
${expression === "happy" ? `<path d="M65 120Q77 105 91 120M135 120Q149 105 162 120" fill="none" stroke="#43334e" stroke-width="5" stroke-linecap="round"/>` : `<path d="M63 109Q75 102 93 111L91 134Q78 145 67 132Z M132 111Q150 102 164 109L160 132Q146 145 134 134Z" fill="white"/><ellipse cx="80" cy="123" rx="11" ry="17" fill="url(#eye${id})"/><ellipse cx="147" cy="123" rx="11" ry="17" fill="url(#eye${id})"/><ellipse cx="80" cy="119" rx="4" ry="9" fill="#353048"/><ellipse cx="147" cy="119" rx="4" ry="9" fill="#353048"/><path d="M62 108Q78 100 95 110M130 110Q148 100 165 107" stroke="#393046" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M64 109L60 104M163 108L169 103" stroke="#393046" stroke-width="3"/><ellipse cx="76" cy="114" rx="4" ry="6" fill="white"/><ellipse cx="143" cy="114" rx="4" ry="6" fill="white"/><circle cx="85" cy="131" r="2.7" fill="white"/><circle cx="152" cy="131" r="2.7" fill="white"/>`}
<ellipse cx="65" cy="141" rx="12" ry="5" fill="#f8b4bf" opacity=".65"/><ellipse cx="162" cy="141" rx="12" ry="5" fill="#f8b4bf" opacity=".65"/>
${expression === "hurt" ? '<path d="M106 154Q112 147 120 154" stroke="#b57287" stroke-width="2.5" fill="none"/><path d="M172 115Q165 127 174 128Q181 126 172 115" fill="#b8eaff"/>' : expression === "happy" ? '<path d="M104 147Q113 152 124 146Q119 163 111 157Z" fill="#c8688a"/>' : '<path d="M106 150Q113 155 120 149" stroke="#b57287" stroke-width="2.5" fill="none" stroke-linecap="round"/>'}
<path d="M46 102Q33 57 70 38Q131 4 174 50Q189 75 177 111L156 78L146 94L122 65L126 97Q99 84 94 69L72 97L65 83L52 112Z" fill="url(#hair${id})" stroke="${shade}" stroke-width="2"/>
<path d="M56 73Q66 49 93 46M107 37Q143 34 163 59" fill="none" stroke="${light}" stroke-width="7" stroke-linecap="round"/>
${pink ? '<path d="M40 79L24 65L24 94L46 90L62 73L63 96L45 90Z" fill="#343449"/><path d="M172 71L185 62L192 83L172 89Z" fill="#353448"/><path d="M163 65L175 70M160 71L172 77" stroke="#fff1bc" stroke-width="4"/>' : '<path d="M53 49Q70 17 116 19Q166 15 177 55L145 67L68 58Z" fill="#343b59"/><path d="M61 47Q119 44 163 55" stroke="#6d7ca7" stroke-width="5"/><path d="M117 29L126 35L124 47L115 53L107 45L108 34Z" fill="#b9e7e4"/><path d="M174 96L187 97L187 120L175 122Z" fill="#33374c"/><path d="M182 115L173 141L153 147" stroke="#65758a" stroke-width="4" fill="none"/>'}`;
}
export function portrait(id: CharacterId, expression: Expression = "normal") {
  const pink = id === "aria",
    accent = pink ? "#f4a7c5" : "#bdb6f4";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520"><defs><linearGradient id="coat${id}" x2="1" y2="1"><stop stop-color="${pink ? "#414358" : "#f1eef9"}"/><stop offset="1" stop-color="${pink ? "#181c2e" : "#a4aecb"}"/></linearGradient></defs><ellipse cx="202" cy="487" rx="111" ry="14" fill="#090c18" opacity=".24"/>
<path d="M145 407L142 472L175 481L191 413M213 413L225 480L257 472L252 407" fill="#2a2d40"/><path d="M142 465L134 485Q137 500 178 491L178 472M225 472L226 491Q270 500 269 483L254 466" fill="#161a2c" stroke="#66718a" stroke-width="3"/>
<path d="M150 270Q119 277 103 318L92 386Q96 411 116 404L148 332M243 275Q274 279 293 320L306 385Q304 404 284 407L256 335" fill="url(#coat${id})" stroke="#252a41" stroke-width="4"/>
<path d="M161 258L144 297L133 407Q189 438 265 409L251 297L231 257Z" fill="url(#coat${id})" stroke="#282c43" stroke-width="4"/>
<path d="M174 244L173 270L198 292L224 268L223 242" fill="#ffe3d5"/><path d="M156 267L179 266L197 290L173 309L150 284M228 265L242 273L243 290L217 309L198 290" fill="${pink ? "#8e849f" : "#fffaff"}"/><path d="M180 282L201 293L215 282L209 333L197 345L185 330Z" fill="${accent}"/>
<path d="M154 312L179 320L178 385L145 381Z M219 320L245 310L254 381L222 385Z" fill="#343d52"/><path d="M155 329L174 335M154 339L174 345M228 331L244 326M229 343L246 338" stroke="#7a869a" stroke-width="3"/><path d="M136 390L262 389L263 409L135 410Z" fill="#272d40"/><rect x="190" y="388" width="26" height="23" rx="3" fill="#a0b5bd"/><rect x="196" y="394" width="14" height="11" fill="#313b50"/><path d="M106 309L129 311L125 336L107 333Z" fill="${accent}"/><path d="M112 317L119 325L123 316" stroke="#fff" fill="none" stroke-width="2"/>
<g transform="translate(23 378) rotate(-15)"><path d="M65 0L101 0L111 -12L233 -12L233 -5L292 -5L292 6L230 7L218 19L173 19L173 31L153 31L151 17L115 17L106 29L88 23L86 12L60 14Z" fill="#202738" stroke="#7b8a9d" stroke-width="3"/><rect x="139" y="-25" width="33" height="12" rx="3" fill="#485b70"/><rect x="145" y="-23" width="20" height="6" fill="${accent}"/><path d="M190 -4L222 -4M188 4L220 4" stroke="#718ba0" stroke-width="3"/><path d="M164 19L190 19L199 48L170 50Z" fill="#3e4c60"/></g><path d="M100 383Q113 367 127 373L140 393Q126 410 113 403Z M270 361Q279 349 292 358L299 379Q284 389 276 379Z" fill="#ffe3d5" stroke="#3c4056" stroke-width="3"/>
<g transform="translate(18 13) scale(1.62)">${head(id, expression)}</g></svg>`;
}
export function headImage(id: CharacterId, expression: Expression = "normal") {
  const img = new Image();
  img.src =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">${head(id, expression)}</svg>`,
    );
  return img;
}
export function weaponIcon(id: string) {
  return `<svg viewBox="0 0 180 60" fill="none" aria-hidden="true"><path d="M12 25h25l10-9h${id === "smg" ? 65 : 90}v5h24v7h-28l-9 11H82l-7 17H61l6-21H42L24 44H12z" fill="currentColor" opacity=".9"/><path d="M80 39h22l8 18H86z" fill="currentColor" opacity=".5"/><path d="M64 8h26v8H64zM103 23h24" stroke="currentColor" stroke-width="4"/></svg>`;
}
