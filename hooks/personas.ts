// The crew's characters: each look is drawn in the same 76×76 box as mascot(), in the same
// chunky flat style, and moves its own way while it works. Like the mascot, every motion is
// SMIL (the cards are script-less SVG images), and nothing animates unless the agent is running.
// The names are the person's own, from config.json; the looks are what ships here.
import type { CrewAgent, CrewConfig, CrewConnection, CrewLook } from '../types'

export type Character = { id: string; name: string; look: CrewLook }

let cast: CrewConfig | undefined

/** The crew the cards and the spawns are read against; undefined before setup. */
export function setCast(next: CrewConfig | undefined): void {
  cast = next
}

/** A character by its id: `lead`, a member's or a connected agent's. */
export function characterOf(id: string | undefined): Character | undefined {
  if (!id || !cast) return undefined
  if (id === 'lead') return { id, ...cast.lead }
  return [...cast.members, ...cast.connections].find(c => c.id === id)
}

export const connectionOf = (id: string | undefined): CrewConnection | undefined => cast?.connections.find(c => c.id === id)

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A whole word in either script: \b knows nothing of Arabic letters.
function namedIn(text: string): string | undefined {
  for (const c of [...(cast?.members ?? []), ...(cast?.connections ?? [])]) {
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(c.name)}(?![\\p{L}\\p{N}])`, 'iu').test(text)) return c.id
  }
  return undefined
}

/** The character id for an agents.json row or a spawned agent, or undefined for the plain look. */
export function personaFor(x: {
  persona?: string
  id?: string
  name?: string
  description?: string
  model?: string
  subagentType?: string
}): string | undefined {
  if (characterOf(x.persona)) return x.persona
  const type = (x.subagentType ?? '').toLowerCase().replace(/^crew:/, '')
  if (type && type !== 'lead' && characterOf(type)) return type
  if ((x.id ?? '').endsWith('-lead') && characterOf('lead')) return 'lead'
  const named = namedIn(`${x.name ?? ''} ${x.description ?? ''}`)
  if (named) return named
  // Last, by model: an agent whose name names no character still gets one of that model's.
  const model = (x.model ?? '').toLowerCase()
  const fits = cast?.members.filter(m => model.includes(m.model)) ?? []
  return fits.length > 0 ? fits[pickOf(x.id ?? x.name ?? '', fits.length)]?.id : undefined
}

// A stable pick: the same seed (an agent's id) always gets the same one.
function pickOf(seed: string, count: number): number {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % count
}

// ---- shared pieces, in the mascot's own look --------------------------------

const CLAY = '#D97757'
const INK = '#1F1E1B'

const loop = (attr: string, values: string, dur: string, extra = '') =>
  `<animate attributeName="${attr}" values="${values}" dur="${dur}" repeatCount="indefinite"${extra}/>`
const spin = (type: string, values: string, dur: string, extra = '') =>
  `<animateTransform attributeName="transform" type="${type}" values="${values}" dur="${dur}" repeatCount="indefinite"${extra}/>`

function legs(color: string): string {
  return [18, 28, 44, 54].map(x => `<rect x="${x}" y="57" width="4" height="9" fill="${color}"/>`).join('')
}

// `rx` is its own argument: passing it in `extra` repeated the attribute, which made the
// whole document invalid XML, so the desktop drew the band's alt text instead.
function body(color: string, extra = '', rx = 3): string {
  return `<rect x="14" y="29" width="48" height="29" rx="${rx}" fill="${color}"${extra}/>`
}

// Eyes for every state but running, the same as the mascot's.
function restEyes(agent: CrewAgent, ink = INK): string | undefined {
  if (agent.status === 'done') {
    return `<path d="M24 42 Q28 36 32 42" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M44 42 Q48 36 52 42" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`
  }
  if (agent.status === 'failed') {
    return `<path d="M24 37 l8 8 M32 37 l-8 8 M44 37 l8 8 M52 37 l-8 8" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`
  }
  if (agent.status === 'idle') {
    return `<path d="M24 42 h8 M44 42 h8" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`
  }
  return undefined
}

const BLINK = `<animate attributeName="height" values="8;8;1;8" keyTimes="0;0.92;0.96;1" dur="3.6s" repeatCount="indefinite"/>
    <animate attributeName="y" values="37;37;40.5;37" keyTimes="0;0.92;0.96;1" dur="3.6s" repeatCount="indefinite"/>`

function eyes(agent: CrewAgent, ink = INK): string {
  return restEyes(agent, ink) ??
    `<rect x="26" y="37" width="5" height="8" fill="${ink}">${BLINK}</rect>
    <rect x="45" y="37" width="5" height="8" fill="${ink}">${BLINK}</rect>`
}

function laptop(): string {
  return `<g>
      <path d="M24 61 L27 50 L49 50 L52 61 Z" fill="#5E5B55"/>
      <path d="M28 52 L48 52 L50 59 L26 59 Z" fill="#8FD3FF">${loop('fill', '#8FD3FF;#C7E9FF;#8FD3FF', '1.2s')}</path>
      <rect x="18" y="61" width="40" height="4" rx="1.5" fill="#9A968C"/>
    </g>`
}

// Two arms; while working they type on the laptop like the mascot's.
function arms(color: string, working: boolean): string {
  const l = working ? spin('translate', '0 0;0 3;0 0', '0.32s') : ''
  const r = working ? spin('translate', '0 3;0 0;0 3', '0.32s') : ''
  const y = working ? 48 : 40
  return `<g>${l}<rect x="7" y="${y}" width="8" height="8" fill="${color}"/></g>
      <g>${r}<rect x="61" y="${y}" width="8" height="8" fill="${color}"/></g>`
}

const bob = (working: boolean) => (working ? spin('translate', '0 0;0 -2;0 0', '0.9s') : '')

function extras(agent: CrewAgent, isSpeaking: boolean): string {
  const zzz = agent.status === 'idle'
    ? `<text x="58" y="20" font-size="12" font-weight="700" class="dim">z
        <animate attributeName="y" values="22;6" dur="2.4s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;0" dur="2.4s" repeatCount="indefinite"/></text>`
    : ''
  const badge = agent.status === 'done'
    ? `<circle cx="64" cy="16" r="9" fill="#2E9E6B"/><path d="M59.5 16 l3 3 l6 -6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
    : agent.status === 'failed'
      ? `<circle cx="64" cy="16" r="9" fill="#D64545"/><rect x="62.8" y="10" width="2.4" height="8" fill="#fff"/><rect x="62.8" y="19.5" width="2.4" height="2.4" fill="#fff"/>`
      : ''
  const bubble = isSpeaking
    ? `<g>
        <path d="M50 2 h24 a4 4 0 0 1 4 4 v12 a4 4 0 0 1 -4 4 h-14 l-6 5 l1 -5 h-5 a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4 Z" fill="#FFFFFF" stroke="#CFC9BC"/>
        <rect x="55" y="7" width="16" height="10" rx="1.5" fill="#F2C230"/>
        <path d="M55 7 l8 6 l8 -6" fill="none" stroke="#B88A14" stroke-width="1.2"/>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0" dur="0.8s" repeatCount="indefinite"/>
      </g>`
    : ''
  return `${zzz}${badge}${bubble}`
}

const cheeks = (color: string, y = 49) =>
  `<circle cx="23" cy="${y}" r="3" fill="${color}" opacity="0.6"/><circle cx="53" cy="${y}" r="3" fill="${color}" opacity="0.6"/>`

// ---- the characters ---------------------------------------------------------

const OPUS = '#7A4FD0'

// The captain: the lead. The mascot with a gold crown (an Opus-purple jewel), round
// purple glasses and a purple bow tie; calm bob and typing while working.
function captain(agent: CrewAgent): string {
  const working = agent.status === 'running'
  return `<g>${bob(working)}
      ${legs(CLAY)}
      ${arms(CLAY, working)}
      ${body(CLAY)}
      ${eyes(agent)}
      <circle cx="28" cy="41" r="7.5" fill="rgba(255,255,255,0.22)" stroke="${OPUS}" stroke-width="2.2"/>
      <circle cx="48" cy="41" r="7.5" fill="rgba(255,255,255,0.22)" stroke="${OPUS}" stroke-width="2.2"/>
      <line x1="35.5" y1="41" x2="40.5" y2="41" stroke="${OPUS}" stroke-width="2.2"/>
      <path d="M26 30 L26 20 L32 25 L38 16 L44 25 L50 20 L50 30 Z" fill="#E8B931" stroke="#B88A14" stroke-width="1.2"/>
      <circle cx="38" cy="16" r="2.2" fill="${OPUS}"/>
      <path d="M31 50 L38 53.5 L45 50 L45 57 L38 53.5 L31 57 Z" fill="${OPUS}"/>
      <circle cx="38" cy="53.5" r="1.8" fill="#5B36A8"/>
      ${working ? laptop() : ''}
    </g>`
}

const BROWN = '#6B4027'

// Bow: a girl with long brown hair, bangs and a pink bow. While
// working her eyes glance left and right.
function bow(agent: CrewAgent): string {
  const working = agent.status === 'running'
  const glance = working
    ? spin('translate', '0 0;-3 0;-3 0;0 0;3 0;3 0;0 0', '3s', ' keyTimes="0;0.1;0.35;0.45;0.55;0.85;1"')
    : ''
  return `<g>${bob(working)}
      <rect x="10" y="22" width="56" height="33" rx="11" fill="${BROWN}"/>
      ${legs(CLAY)}
      ${body(CLAY)}
      <path d="M14 36 Q14 21 38 21 Q62 21 62 36 Q57 31 51 35 Q45 30 38 34.5 Q31 30 25 35 Q19 31 14 36 Z" fill="${BROWN}"/>
      <rect x="11" y="30" width="7" height="24" rx="3.5" fill="${BROWN}"/>
      <rect x="58" y="30" width="7" height="24" rx="3.5" fill="${BROWN}"/>
      ${arms(CLAY, working)}
      <g>${glance}${eyes(agent)}</g>
      ${cheeks('#F28FA0')}
      <path d="M50 22 L44 16 L44 27 Z M50 22 L56 16 L56 27 Z" fill="#F06E9A"/>
      <circle cx="50" cy="22" r="2.2" fill="#D9487A"/>
      ${working ? laptop() : ''}
    </g>`
}

const CAT = '#8F8A84'
const CAT_DARK = '#68635D'

// Cat: a grey tabby cat in the crew's boxy shape — pointed ears, whiskers,
// a tail. While working the tail swishes and an ear twitches.
function cat(agent: CrewAgent): string {
  const working = agent.status === 'running'
  const swish = working ? spin('rotate', '0 60 54;-18 60 54;0 60 54;10 60 54;0 60 54', '1.4s') : ''
  const twitchL = working ? spin('rotate', '0 22 30;0 22 30;-14 22 30;0 22 30;0 22 30', '2.6s', ' keyTimes="0;0.66;0.72;0.8;1"') : ''
  const twitchR = working ? spin('rotate', '0 54 30;0 54 30;14 54 30;0 54 30;0 54 30', '2.6s', ' keyTimes="0;0.2;0.26;0.34;1"') : ''
  const look = restEyes(agent) ??
    `<rect x="25" y="37" width="7" height="8" rx="2" fill="#8CC63F">${BLINK}</rect>
     <rect x="44" y="37" width="7" height="8" rx="2" fill="#8CC63F">${BLINK}</rect>
     <rect x="27.6" y="37" width="1.8" height="8" fill="${INK}">${BLINK}</rect>
     <rect x="46.6" y="37" width="1.8" height="8" fill="${INK}">${BLINK}</rect>`
  return `<g>${bob(working)}
      <g>${swish}
        <path d="M60 54 Q73 53 70 36" fill="none" stroke="${CAT}" stroke-width="5.5" stroke-linecap="round"/>
        <path d="M70.6 40 Q70.8 38 70 36" fill="none" stroke="${CAT_DARK}" stroke-width="5.5" stroke-linecap="round"/>
      </g>
      ${legs(CAT)}
      <g>${twitchL}<path d="M15 32 L18 15 L31 30 Z" fill="${CAT}"/><path d="M19 28 L20.5 21 L26 28 Z" fill="#F2A7B5"/></g>
      <g>${twitchR}<path d="M61 32 L58 15 L45 30 Z" fill="${CAT}"/><path d="M57 28 L55.5 21 L50 28 Z" fill="#F2A7B5"/></g>
      ${body(CAT, '', 6)}
      <rect x="33" y="29" width="2.2" height="5" fill="${CAT_DARK}"/><rect x="37" y="29" width="2.2" height="6.5" fill="${CAT_DARK}"/><rect x="41" y="29" width="2.2" height="5" fill="${CAT_DARK}"/>
      <rect x="14" y="44" width="5" height="2" fill="${CAT_DARK}"/><rect x="57" y="44" width="5" height="2" fill="${CAT_DARK}"/>
      ${look}
      <path d="M35.5 46.5 h5 l-2.5 3 Z" fill="#E27C93"/>
      <path d="M34.5 50.5 Q36.2 52.5 38 50.5 Q39.8 52.5 41.5 50.5" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M22 47 L7 45 M22 50 L7 51.5 M54 47 L69 45 M54 50 L69 51.5" stroke="#4A4642" stroke-width="1.1" stroke-linecap="round"/>
      <rect x="20" y="54" width="9" height="6" rx="3" fill="#E9E4DD"/>
      <rect x="47" y="54" width="9" height="6" rx="3" fill="#E9E4DD"/>
    </g>`
}

const HOODIE = '#2F3A56'

function note(x: number, y: number, begin: string): string {
  return `<g transform="translate(${x} ${y})"><g opacity="0">
      <circle cx="0" cy="0" r="2.6" fill="#19A7A0"/>
      <rect x="1.2" y="-9" width="1.6" height="9" fill="#19A7A0"/>
      <path d="M2.8 -9 Q7 -7.5 5.5 -4" fill="none" stroke="#19A7A0" stroke-width="1.6" stroke-linecap="round"/>
      ${spin('translate', '0 0;5 -16', '1.6s', ` begin="${begin}"`)}
      ${loop('opacity', '0;1;1;0', '1.6s', ` keyTimes="0;0.15;0.7;1" begin="${begin}"`)}
    </g></g>`
}

// Music: a darker-clay mascot in a navy hoodie and big teal headphones,
// lost in the music: nods to the beat, eyes shut, notes floating up.
function music(agent: CrewAgent): string {
  const working = agent.status === 'running'
  const clay = '#BE6446'
  const nod = working ? spin('translate', '0 0;0 2.5;0 0', '0.55s') : ''
  const look = working
    ? `<path d="M24 40 Q28 44 32 40 M44 40 Q48 44 52 40" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`
    : eyes(agent)
  return `<g>
      ${legs('#3A3A42')}
      <g>${nod}
        ${body(clay)}
        <rect x="14" y="47" width="48" height="11" rx="2" fill="${HOODIE}"/>
        <path d="M30 47 L30 53 M46 47 L46 53" stroke="#E9E4DD" stroke-width="1.6" stroke-linecap="round"/>
        <rect x="7" y="42" width="8" height="10" fill="${HOODIE}"/>
        <rect x="61" y="42" width="8" height="10" fill="${HOODIE}"/>
        ${look}
        <path d="M11 38 Q11 13 38 13 Q65 13 65 38" fill="none" stroke="#222" stroke-width="4.5"/>
        <rect x="4" y="31" width="11" height="17" rx="4" fill="#19A7A0"/>
        <rect x="61" y="31" width="11" height="17" rx="4" fill="#19A7A0"/>
        <rect x="7" y="34" width="5" height="11" rx="2" fill="#0F6E69"/>
        <rect x="64" y="34" width="5" height="11" rx="2" fill="#0F6E69"/>
      </g>
      ${working ? note(66, 28, '0s') + note(8, 26, '0.8s') : ''}
    </g>`
}

const HELMET = '#5B7340'
const HELMET_DARK = '#435730'

// Helmet: a mascot in an olive helmet, brows slanted down, mouth flat —
// annoyed. While working his face turns left and right, still annoyed.
function helmet(agent: CrewAgent): string {
  const working = agent.status === 'running'
  const turn = working
    ? spin('translate', '0 0;0 0;-4 0;-4 0;0 0;0 0;4 0;4 0;0 0', '4.4s', ' keyTimes="0;0.1;0.16;0.38;0.44;0.56;0.62;0.86;1"')
    : ''
  return `<g>${bob(working)}
      ${legs(CLAY)}
      ${arms(CLAY, working)}
      ${body(CLAY)}
      <g>${turn}
        ${eyes(agent)}
        <path d="M22.5 32.5 L32.5 36 M53.5 32.5 L43.5 36" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
        <rect x="32" y="50" width="12" height="2.6" rx="1.3" fill="${INK}"/>
      </g>
      <path d="M15 29 Q15 10 38 10 Q61 10 61 29 Z" fill="${HELMET}"/>
      <rect x="11" y="26" width="54" height="5" rx="2.5" fill="${HELMET_DARK}"/>
      <rect x="35.5" y="11" width="5" height="15" rx="1" fill="${HELMET_DARK}"/>
      <path d="M15 31 L15 46 M61 31 L61 46" stroke="${HELMET_DARK}" stroke-width="2.4" stroke-linecap="round"/>
      ${working ? laptop() : ''}
    </g>`
}

const HOLO = '#E8FAFD'
const HOLO_EDGE = '#7FD3E0'
const HOLO_INK = '#1F7A8C'

// Hologram: a pale white-cyan hologram with scanlines, holding a phone,
// standing on its projector. While working it jitters and flickers.
function hologram(agent: CrewAgent): string {
  const working = agent.status === 'running'
  const jitter = working ? spin('translate', '0 0;1.2 0;-1 0.4;0.6 -0.6;-0.8 0.3;0 0', '0.28s') : ''
  const flicker = working ? loop('opacity', '0.78;0.78;0.35;0.85;0.5;0.78', '2.2s', ' keyTimes="0;0.78;0.82;0.86;0.9;1"') : ''
  const scan = [33, 37, 41, 45, 49, 53]
    .map(y => `<line x1="15" y1="${y}" x2="61" y2="${y}" stroke="${HOLO_EDGE}" stroke-width="0.9" opacity="0.55"/>`)
    .join('')
  return `<ellipse cx="38" cy="69" rx="20" ry="3.2" fill="${HOLO_EDGE}" opacity="0.55"/>
    <g>${jitter}<g opacity="0.78">${flicker}
      ${[18, 28, 44, 54].map(x => `<rect x="${x}" y="57" width="4" height="9" fill="${HOLO}" stroke="${HOLO_EDGE}" stroke-width="0.8"/>`).join('')}
      <rect x="7" y="40" width="8" height="8" fill="${HOLO}" stroke="${HOLO_EDGE}" stroke-width="0.8"/>
      ${body(HOLO, ` stroke="${HOLO_EDGE}" stroke-width="1.2"`)}
      ${scan}
      ${eyes(agent, HOLO_INK)}
      <rect x="53" y="36" width="11" height="18" rx="2.5" fill="#2E3440"/>
      <rect x="54.8" y="38.5" width="7.4" height="12" rx="1" fill="#8FD3FF">${working ? loop('fill', '#8FD3FF;#D7F1FF;#8FD3FF', '0.9s') : ''}</rect>
      <rect x="61" y="44" width="9" height="8" fill="${HOLO}" stroke="${HOLO_EDGE}" stroke-width="0.8"/>
    </g></g>`
}

const PINK = '#F27BAA'
const PINK_DARK = '#D9558C'

function heart(begin: string): string {
  return `<g transform="translate(62 26)"><g opacity="0">
      <path d="M0 2 C-5 -2 -2.5 -6 0 -3.2 C2.5 -6 5 -2 0 2 Z" fill="${PINK}"/>
      ${spin('translate', '0 0;3 -18', '2s', ` begin="${begin}"`)}
      ${loop('opacity', '0;1;1;0', '2s', ` keyTimes="0;0.15;0.7;1" begin="${begin}"`)}
    </g></g>`
}

// Pink: a cheerful girl — pink hair in two buns, a pink dress, rosy cheeks.
// While working she sways happily and little hearts float up.
function pink(agent: CrewAgent): string {
  const working = agent.status === 'running'
  const sway = working ? spin('rotate', '-6 38 66;6 38 66;-6 38 66', '1.6s') : ''
  return `<g>${sway}
      <circle cx="17" cy="21" r="7.5" fill="${PINK}"/>
      <circle cx="59" cy="21" r="7.5" fill="${PINK}"/>
      <rect x="11" y="23" width="54" height="22" rx="10" fill="${PINK}"/>
      ${legs(CLAY)}
      ${body(CLAY)}
      <path d="M14 35 Q14 22 38 22 Q62 22 62 35 L56 31 L50 35 L44 31 L38 35 L32 31 L26 35 L20 31 Z" fill="${PINK}"/>
      <path d="M14 50 L62 50 L67 61 L9 61 Z" fill="${PINK}"/>
      <rect x="14" y="50" width="48" height="2.5" fill="${PINK_DARK}"/>
      ${arms(CLAY, false)}
      ${eyes(agent)}
      ${cheeks('#F0527F', 46)}
      <path d="M35 47 Q38 49.5 41 47" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M38 17.5 l1.6 3.2 3.5 .5 -2.5 2.4 .6 3.5 -3.2 -1.7 -3.2 1.7 .6 -3.5 -2.5 -2.4 3.5 -.5 Z" fill="#F2C230"/>
    </g>${working ? heart('0s') + heart('1s') : ''}`
}

const GREEN = '#3E9B5A'
const GREEN_DARK = '#2C7643'

function symbol(x: number, d: string, begin: string, dots = ''): string {
  return `<g transform="translate(${x} 7)"><g opacity="0">
      <path d="${d}" stroke="${GREEN_DARK}" stroke-width="2.6" stroke-linecap="round"/>${dots}
      ${loop('opacity', '0;1;1;0;0', '2.4s', ` keyTimes="0;0.06;0.2;0.25;1" begin="${begin}"`)}
      ${spin('scale', '0.4;1.15;1;1;1', '2.4s', ` keyTimes="0;0.06;0.1;0.25;1" begin="${begin}"`)}
    </g></g>`
}

// Scarf: a girl in green — beanie, braids, a striped scarf — with narrowed,
// focused eyes. While working + − × ÷ pop above her head one after another.
function scarf(agent: CrewAgent): string {
  const working = agent.status === 'running'
  const look = working
    ? `<rect x="26" y="40" width="5" height="4" fill="${INK}"/><rect x="45" y="40" width="5" height="4" fill="${INK}"/>
       <path d="M24 37 h9 M43 37 h9" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`
    : eyes(agent)
  const tap = working ? spin('translate', '0 0;0 -3;0 0', '0.6s') : ''
  const sums = working
    ? symbol(12, 'M-4 0 h8 M0 -4 v8', '0s') +
      symbol(28, 'M-4 0 h8', '0.6s') +
      symbol(48, 'M-3.2 -3.2 l6.4 6.4 M3.2 -3.2 l-6.4 6.4', '1.2s') +
      symbol(64, 'M-4 0 h8', '1.8s', `<circle cx="0" cy="-3.6" r="1.4" fill="${GREEN_DARK}"/><circle cx="0" cy="3.6" r="1.4" fill="${GREEN_DARK}"/>`)
    : ''
  return `<g>${bob(working)}
      ${legs(CLAY)}
      ${body(CLAY)}
      <rect x="10" y="30" width="6" height="20" rx="3" fill="#5A3A28"/>
      <rect x="60" y="30" width="6" height="20" rx="3" fill="#5A3A28"/>
      <rect x="9.5" y="46" width="7" height="3" rx="1.5" fill="${GREEN}"/><rect x="59.5" y="46" width="7" height="3" rx="1.5" fill="${GREEN}"/>
      <path d="M15 30 Q15 13 38 13 Q61 13 61 30 Z" fill="${GREEN}"/>
      <rect x="13" y="27" width="50" height="6" rx="3" fill="${GREEN_DARK}"/>
      <circle cx="38" cy="12" r="4.2" fill="#CDEBD5"/>
      ${look}
      <rect x="12" y="49" width="52" height="7" rx="3" fill="${GREEN}"/>
      <rect x="22" y="49" width="3" height="7" fill="#E9F5EC"/><rect x="34" y="49" width="3" height="7" fill="#E9F5EC"/><rect x="50" y="49" width="3" height="7" fill="#E9F5EC"/>
      <rect x="44" y="53" width="7" height="12" rx="2" fill="${GREEN}"/>
      <rect x="44" y="58" width="7" height="2.5" fill="#E9F5EC"/>
      <rect x="7" y="40" width="8" height="8" fill="${CLAY}"/>
      <g>${tap}
        <rect x="61" y="40" width="8" height="8" fill="${CLAY}"/>
        <path d="M66 41 L71 31" stroke="#F2C230" stroke-width="3" stroke-linecap="round"/>
        <path d="M70.4 32.2 L71 31" stroke="#E2483D" stroke-width="3" stroke-linecap="round"/>
      </g>
    </g>${sums}`
}

const DRAW: Record<CrewLook, (agent: CrewAgent) => string> = { captain, bow, cat, music, helmet, hologram, pink, scarf }

/** The persona's character in the same 76×76 frame as mascot(): status-aware (running animates; done/failed badges like mascot; idle Zzz), speech bubble when isSpeaking. Returns the inner SVG markup exactly like mascot() does. */
export function personaMascot(look: CrewLook, agent: CrewAgent, isSpeaking: boolean): string {
  const draw = DRAW[look] ?? captain
  return `${draw(agent)}${extras(agent, isSpeaking)}`
}
