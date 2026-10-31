// The drawings: one SVG per agent card and one per message. Each is drawn
// as an interactive (script-less) frame, so the SMIL animations run.
import type { CrewAgent, CrewMessage, CrewOutfit } from '../types'
import { characterOf, escapeRegExp, personaMascot } from './personas'
import { isRtl, t } from './strings'

const CLAY = '#D97757'
const CLAY_DARK = '#B85C3E'

export type ModelLook = { label: string; color: string }

export function modelLook(model: string): ModelLook {
  const m = model.toLowerCase()
  const version = (m.match(/(\d+)[-.](\d+)/) ?? []).slice(1, 3).join('.')
  const tail = version ? ' ' + version : ''
  if (m.includes('haiku')) return { label: 'Haiku' + tail, color: '#2E9E6B' }
  if (m.includes('sonnet')) return { label: 'Sonnet' + tail, color: '#3B6FD8' }
  if (m.includes('opus')) return { label: 'Opus' + tail, color: '#7A4FD0' }
  if (m.includes('fable')) return { label: 'Fable' + tail, color: '#C2410C' }
  // Codex's families, in the colours of its own agent desk.
  if (m.includes('luna')) return { label: 'Luna', color: '#8C74C4' }
  if (m.includes('sol')) return { label: 'Sol', color: '#C99446' }
  if (m.includes('terra')) return { label: 'Terra', color: '#5E9C80' }
  if (m.includes('astra')) return { label: 'Astra', color: '#5F86B8' }
  if (m.startsWith('gpt') || m === 'codex') return { label: 'Codex', color: '#6B7A76' }
  if (m === '' || m === 'inherit') return { label: '…', color: '#8A8578' }
  return { label: model.slice(0, 14), color: '#8A8578' }
}

const OUTFITS: Record<string, CrewOutfit[]> = {
  haiku: ['cap', 'headphones', 'bandana'],
  sonnet: ['hardhat', 'glasses', 'beret'],
  opus: ['wizard', 'monocle', 'glasses'],
  other: ['beret', 'cap', 'headphones'],
}

// Same model, different outfit: the nth agent of a model takes the nth look.
export function pickOutfit(model: string, nth: number): CrewOutfit {
  const m = model.toLowerCase()
  const key = m.includes('haiku') ? 'haiku' : m.includes('sonnet') ? 'sonnet' : m.includes('opus') ? 'opus' : 'other'
  const list = OUTFITS[key] ?? ['beret']
  return list[nth % list.length] ?? 'beret'
}

export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function clip(text: string | undefined, max: number): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

// The account prefix an agent's name may carry: "Account 2 · ", in either language.
const ACCOUNT_PREFIX = /^(?:حساب|Account)\s*[0-9٠-٩]+\s*·\s*/i

// The name a card prints: the character's name alone when it has one,
// otherwise the agent's name without its account prefix.
export function titled(agent: CrewAgent): string {
  return characterOf(agent.persona)?.name ?? agent.name.replace(ACCOUNT_PREFIX, '')
}

// The task an agent was given: what is left of its name once the account prefix and the
// character's name ("Scout: " or "Scout · " in front) are taken off. The coordinator has none.
export function taskOf(agent: CrewAgent): string {
  if (agent.isMain) return ''
  let rest = agent.name.replace(ACCOUNT_PREFIX, '')
  const tag = characterOf(agent.persona)?.name
  if (tag) rest = rest === tag ? '' : rest.replace(new RegExp(`^${escapeRegExp(tag)}\\s*[:·]\\s*`), '')
  return rest.trim()
}

const STYLE = `
<style>
  .card { fill: #FFFFFF; stroke: #E8E4DA; }
  .ink { fill: #1F1E1B; }
  .dim { fill: #77736A; }
  .eye { fill: #1F1E1B; }
  .line { stroke: #CFC9BC; }
  @media (prefers-color-scheme: dark) {
    .card { fill: #262624; stroke: #3A3936; }
    .ink { fill: #F2EFE8; }
    .dim { fill: #A39E93; }
    .line { stroke: #4A4844; }
  }
  text { font-family: "Segoe UI", system-ui, Tahoma, sans-serif; }
</style>`

function outfit(kind: CrewOutfit): string {
  switch (kind) {
    case 'crown':
      return `<path d="M22 30 L22 18 L30 25 L38 14 L46 25 L54 18 L54 30 Z" fill="#E8B931" stroke="#B88A14" stroke-width="1.2"/>
        <circle cx="38" cy="14" r="2.2" fill="#E2483D"/>`
    case 'cap':
      return `<path d="M16 31 Q16 16 38 16 Q60 16 60 31 Z" fill="#2F6FE0"/>
        <rect x="56" y="27" width="16" height="4" rx="2" fill="#1F4FB0"/>
        <circle cx="38" cy="17" r="2" fill="#1F4FB0"/>`
    case 'headphones':
      return `<path d="M12 40 Q12 12 38 12 Q64 12 64 40" fill="none" stroke="#2B2B2B" stroke-width="3.5"/>
        <rect x="6" y="34" width="9" height="14" rx="3" fill="#E2483D"/>
        <rect x="61" y="34" width="9" height="14" rx="3" fill="#E2483D"/>`
    case 'bandana':
      return `<rect x="14" y="29" width="48" height="6" fill="#E2483D"/>
        <path d="M62 31 L72 26 L70 34 Z M62 33 L73 36 L66 40 Z" fill="#C2342A"/>
        <circle cx="24" cy="32" r="1" fill="#fff"/><circle cx="36" cy="32" r="1" fill="#fff"/><circle cx="48" cy="32" r="1" fill="#fff"/>`
    case 'hardhat':
      return `<path d="M17 31 Q17 14 38 14 Q59 14 59 31 Z" fill="#F2C230"/>
        <rect x="12" y="29" width="52" height="4" rx="2" fill="#D9A70F"/>
        <rect x="36" y="14" width="4" height="15" fill="#D9A70F"/>`
    case 'glasses':
      return `<circle cx="28" cy="41" r="7" fill="rgba(255,255,255,0.25)" stroke="#2B2B2B" stroke-width="2"/>
        <circle cx="48" cy="41" r="7" fill="rgba(255,255,255,0.25)" stroke="#2B2B2B" stroke-width="2"/>
        <line x1="35" y1="41" x2="41" y2="41" stroke="#2B2B2B" stroke-width="2"/>
        <path d="M24 30 Q38 22 52 30" fill="none" stroke="${CLAY_DARK}" stroke-width="2.5"/>`
    case 'beret':
      return `<ellipse cx="34" cy="28" rx="22" ry="7" fill="#3B3B5C" transform="rotate(-8 34 28)"/>
        <rect x="32" y="18" width="3" height="5" fill="#3B3B5C"/>`
    case 'wizard':
      return `<path d="M38 0 L56 30 L20 30 Z" fill="#6C46C9"/>
        <rect x="12" y="28" width="52" height="5" rx="2.5" fill="#55349F"/>
        <path d="M38 9 l1.8 3.6 4 .6 -2.9 2.8 .7 4 -3.6 -1.9 -3.6 1.9 .7 -4 -2.9 -2.8 4 -.6 Z" fill="#F2C230">
          <animate attributeName="opacity" values="1;0.35;1" dur="2.2s" repeatCount="indefinite"/>
        </path>`
    case 'robot':
      return ''
    case 'monocle':
      return `<rect x="24" y="8" width="28" height="18" fill="#4B4B5E" stroke="#2E2E3A" stroke-width="1"/>
        <rect x="16" y="25" width="44" height="5" rx="2" fill="#3A3A4A"/>
        <rect x="24" y="20" width="28" height="3" fill="#B23A3A"/>
        <circle cx="48" cy="41" r="7.5" fill="rgba(255,255,255,0.25)" stroke="#C9A227" stroke-width="2"/>
        <path d="M55 44 Q60 56 52 64" fill="none" stroke="#C9A227" stroke-width="1"/>`
  }
}

function eyes(agent: CrewAgent): string {
  if (agent.status === 'done') {
    return `<path d="M24 42 Q28 36 32 42" fill="none" stroke="#1F1E1B" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M44 42 Q48 36 52 42" fill="none" stroke="#1F1E1B" stroke-width="2.6" stroke-linecap="round"/>`
  }
  if (agent.status === 'failed') {
    return `<path d="M24 37 l8 8 M32 37 l-8 8 M44 37 l8 8 M52 37 l-8 8" stroke="#1F1E1B" stroke-width="2.6" stroke-linecap="round"/>`
  }
  if (agent.status === 'idle') {
    return `<path d="M24 42 h8 M44 42 h8" stroke="#1F1E1B" stroke-width="2.6" stroke-linecap="round"/>`
  }
  const blink = `<animate attributeName="height" values="8;8;1;8" keyTimes="0;0.92;0.96;1" dur="3.6s" repeatCount="indefinite"/>
    <animate attributeName="y" values="37;37;40.5;37" keyTimes="0;0.92;0.96;1" dur="3.6s" repeatCount="indefinite"/>`
  return `<rect x="26" y="37" width="5" height="8" class="eye">${blink}</rect>
    <rect x="45" y="37" width="5" height="8" class="eye">${blink}</rect>`
}

const ROBOT_TONE: Record<string, string> = {
  sol: '#E0B679',
  luna: '#B9A4E0',
  terra: '#93C4AE',
  astra: '#94B4DC',
  codex: '#DCE6E3',
}

function robotTone(model: string): string {
  const m = model.toLowerCase()
  const family = Object.keys(ROBOT_TONE).find(f => m.includes(f)) ?? 'codex'
  return ROBOT_TONE[family] ?? '#DCE6E3'
}

// Codex's agent, drawn after its own desk: a rounded square head with an
// antenna, two bar eyes that blink and a mouth that talks while it works.
function robot(agent: CrewAgent): string {
  const tone = robotTone(agent.model)
  const working = agent.status === 'running'
  const sway = working
    ? `<animateTransform attributeName="transform" type="rotate" values="-3 38 60;3 38 60;-3 38 60" dur="2.8s" repeatCount="indefinite"/>`
    : ''
  const blink = working
    ? `<animate attributeName="height" values="12;12;2;12" keyTimes="0;0.9;0.95;1" dur="4s" repeatCount="indefinite"/>`
    : ''
  const eyes = agent.status === 'done'
    ? `<path d="M26 37 Q30 32 34 37 M42 37 Q46 32 50 37" fill="none" stroke="#242832" stroke-width="3" stroke-linecap="round"/>`
    : agent.status === 'failed'
      ? `<path d="M26 31 l7 7 M33 31 l-7 7 M43 31 l7 7 M50 31 l-7 7" stroke="#242832" stroke-width="2.6" stroke-linecap="round"/>`
      : `<rect x="28" y="29" width="6" height="12" rx="3" fill="#242832">${blink}</rect>
        <rect x="42" y="29" width="6" height="12" rx="3" fill="#242832">${blink}</rect>`
  const mouth = working
    ? `<rect x="33" y="46" width="10" height="3" rx="1.5" fill="#242832">
        <animate attributeName="height" values="3;6;3" dur="0.7s" repeatCount="indefinite"/></rect>`
    : `<rect x="33" y="46" width="10" height="3" rx="1.5" fill="#242832"/>`
  const laptop = working
    ? `<path d="M22 66 L25 58 L51 58 L54 66 Z" fill="#5E5B55"/><rect x="18" y="66" width="40" height="3" rx="1.5" fill="#9A968C"/>`
    : ''
  const badge = agent.status === 'done'
    ? `<circle cx="64" cy="14" r="9" fill="#2E9E6B"/><path d="M59.5 14 l3 3 l6 -6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
    : agent.status === 'failed'
      ? `<circle cx="64" cy="14" r="9" fill="#D64545"/><rect x="62.8" y="8" width="2.4" height="8" fill="#fff"/><rect x="62.8" y="17.5" width="2.4" height="2.4" fill="#fff"/>`
      : ''
  return `<g>${sway}
      <rect x="36" y="8" width="4" height="10" rx="2" fill="${tone}"/>
      <circle cx="38" cy="8" r="3.5" fill="${tone}">${working ? '<animate attributeName="r" values="3.5;4.5;3.5" dur="1.4s" repeatCount="indefinite"/>' : ''}</circle>
      <rect x="16" y="17" width="44" height="40" rx="13" fill="${tone}"/>
      <rect x="22" y="55" width="8" height="8" rx="2" fill="${tone}"/>
      <rect x="46" y="55" width="8" height="8" rx="2" fill="${tone}"/>
      ${eyes}${mouth}${laptop}
    </g>${badge}`
}

// The mascot alone, in a 76×76 box: body, legs, arms, face, outfit, and what
// it holds for its state (a laptop while working, Zzz while idle).
export function mascot(agent: CrewAgent, isSpeaking: boolean): string {
  const character = characterOf(agent.persona)
  if (character) return personaMascot(character.look, agent, isSpeaking)
  if (agent.outfit === 'robot') return robot(agent)
  const working = agent.status === 'running'
  const bob = working
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="0.9s" repeatCount="indefinite"/>`
    : ''
  const typeL = working
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 3;0 0" dur="0.32s" repeatCount="indefinite"/>`
    : ''
  const typeR = working
    ? `<animateTransform attributeName="transform" type="translate" values="0 3;0 0;0 3" dur="0.32s" repeatCount="indefinite"/>`
    : ''
  const legs = [18, 28, 44, 54]
    .map(x => `<rect x="${x}" y="57" width="4" height="9" fill="${CLAY}"/>`)
    .join('')
  const laptop = working
    ? `<g>
        <path d="M24 61 L27 50 L49 50 L52 61 Z" fill="#5E5B55"/>
        <path d="M28 52 L48 52 L50 59 L26 59 Z" fill="#8FD3FF">
          <animate attributeName="fill" values="#8FD3FF;#C7E9FF;#8FD3FF" dur="1.2s" repeatCount="indefinite"/>
        </path>
        <rect x="18" y="61" width="40" height="4" rx="1.5" fill="#9A968C"/>
      </g>`
    : ''
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
  return `<g>${bob}
      ${legs}
      <g>${typeL}<rect x="7" y="${working ? 48 : 40}" width="8" height="8" fill="${CLAY}"/></g>
      <g>${typeR}<rect x="61" y="${working ? 48 : 40}" width="8" height="8" fill="${CLAY}"/></g>
      <rect x="14" y="29" width="48" height="29" rx="3" fill="${CLAY}"/>
      ${eyes(agent)}
      ${outfit(agent.outfit)}
      ${laptop}
    </g>${zzz}${badge}${bubble}`
}

function minutes(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return t('seconds', { n: s })
  const m = Math.floor(s / 60)
  return m < 60 ? t('minutes', { m, s: s % 60 }) : t('hours', { h: Math.floor(m / 60), m: m % 60 })
}

const statusWord = (status: CrewAgent['status']): string =>
  t(status === 'running' ? 'statusRunning' : status === 'done' ? 'statusDone' : status === 'failed' ? 'statusFailed' : 'statusIdle')

// Lines of the page's own language: Arabic reads from the right edge of its box.
const flow = (): string => (isRtl() ? ' direction="rtl" text-anchor="end"' : '')

export const CARD_W = 360
export const CARD_H = 88

// A card, line by line: the name (the model chip on its right), the task or what the
// agent is doing under it, then the details, and the time it has taken last.
export function cardSvg(agent: CrewAgent, speech: string | undefined, now: number): string {
  const look = modelLook(agent.model)
  const chipW = Math.round(look.label.length * 7.4 + 22)
  const chipX = CARD_W - 12 - chipW
  const nameMax = Math.max(10, Math.floor((chipX - 120) / 10))
  const name = clip(titled(agent), nameMax)
  // An Arabic name reads right to left, so its ellipsis lands at its left end.
  const nameDir = /[؀-ۿ]/.test(name) ? ' direction="rtl" text-anchor="end"' : ''
  // The line under the name: the speech, else what it is doing, else its task, else its status.
  const task = taskOf(agent)
  const status = speech
    ? `✉ ${speech}`
    : agent.activity && agent.status === 'running' ? agent.activity : task || statusWord(agent.status)
  const elapsed = (agent.endedAt ?? now) - agent.startedAt
  const meta = agent.isMain ? t('coordinator') : agent.kind
  const time = t(agent.endedAt === undefined ? 'runningFor' : 'finishedIn', { time: minutes(elapsed) })
  const accent = agent.status === 'failed' ? '#D64545' : agent.status === 'done' ? '#2E9E6B' : look.color
  // The lines under the name run the card's whole width; the clip keeps a long one inside it.
  const textW = CARD_W - 100 - 12
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
    ${STYLE}
    <clipPath id="lines"><rect x="98" y="32" width="${textW + 2}" height="${CARD_H - 36}"/></clipPath>
    <clipPath id="name"><rect x="98" y="8" width="${chipX - 98 - 18}" height="26"/></clipPath>
    <rect x="1" y="1" width="${CARD_W - 2}" height="${CARD_H - 2}" rx="14" class="card" stroke-width="1"/>
    <rect x="1" y="12" width="4" height="${CARD_H - 24}" rx="2" fill="${accent}"/>
    <g transform="translate(12 10) scale(0.9)">${mascot(agent, speech !== undefined)}</g>
    <text x="100" y="27" font-size="15" font-weight="650" class="ink" clip-path="url(#name)"${nameDir}>${esc(name)}</text>
    <g clip-path="url(#lines)">
      <text x="100" y="44" font-size="13" class="ink"${flow()}${speech ? ' font-style="italic"' : ''}>${esc(clip(status, 36))}</text>
      <text x="100" y="60" font-size="11.5" class="dim"${flow()}>${esc(clip(meta, 40))}</text>
      <text x="100" y="75" font-size="11" class="dim"${flow()}>${esc(time)}</text>
    </g>
    <rect x="${chipX}" y="12" width="${chipW}" height="22" rx="11" fill="${look.color}"/>
    <text x="${chipX + chipW / 2}" y="27.5" font-size="12.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc(look.label)}</text>
    ${agent.status === 'running' ? `<circle cx="${chipX - 10}" cy="23" r="4" fill="${look.color}"><animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/></circle>` : ''}
  </svg>`
}

export const MSG_H = 92

// A message: the sender on the left, the receiver on the right, and an
// envelope that flies from one to the other, then rests at the receiver.
export function messageSvg(msg: CrewMessage, from: CrewAgent | undefined, to: CrewAgent | undefined): string {
  const head = (a: CrewAgent | undefined, x: number) => {
    const face: CrewAgent = a ?? {
      id: '?', name: '?', kind: '', model: '', outfit: 'beret', status: 'idle', startedAt: 0,
    }
    return `<g transform="translate(${x} 6) scale(0.62)">${mascot({ ...face, status: face.status === 'running' ? 'idle' : face.status }, false)}</g>`
  }
  const fromName = from ? titled(from) : msg.from
  const toName = to ? titled(to) : msg.to
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${MSG_H}" width="${CARD_W}" height="${MSG_H}">
    ${STYLE}
    <rect x="1" y="1" width="${CARD_W - 2}" height="${MSG_H - 2}" rx="14" class="card" stroke-width="1"/>
    ${head(from, 12)}
    ${head(to, CARD_W - 62)}
    <path id="route" d="M66 30 Q${CARD_W / 2} 4 ${CARD_W - 66} 30" fill="none" class="line" stroke-width="1.6" stroke-dasharray="4 5"/>
    <g>
      <rect x="-9" y="-6" width="18" height="12" rx="2" fill="#F2C230"/>
      <path d="M-9 -6 l9 6.5 l9 -6.5" fill="none" stroke="#B88A14" stroke-width="1.2"/>
      <animateMotion dur="1.5s" repeatCount="3" fill="freeze" path="M66 30 Q${CARD_W / 2} 4 ${CARD_W - 66} 30"/>
    </g>
    <text x="14" y="70" font-size="11" class="dim">${esc(clip(fromName, 20))}</text>
    <text x="${CARD_W - 14}" y="70" font-size="11" class="dim" text-anchor="end">${esc(clip(toName, 20))}</text>
    <text x="${CARD_W / 2}" y="84" font-size="12" class="ink" text-anchor="middle">«${esc(clip(msg.text, 44))}»</text>
  </svg>`
}

export function emptySvg(): string {
  const sleeper: CrewAgent = {
    id: 'empty', name: '', kind: '', model: '', outfit: 'crown', status: 'idle', startedAt: 0,
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} 120" width="${CARD_W}" height="120">
    ${STYLE}
    <rect x="1" y="1" width="${CARD_W - 2}" height="118" rx="14" class="card" stroke-width="1"/>
    <g transform="translate(${CARD_W / 2 - 38} 6)">${mascot(sleeper, false)}</g>
    <text x="${CARD_W / 2}" y="94" font-size="13" class="ink" text-anchor="middle">${esc(t('emptyLine1'))}</text>
    <text x="${CARD_W / 2}" y="110" font-size="11" class="dim" text-anchor="middle">${esc(t('emptyLine2'))}</text>
  </svg>`
}

// The band above the prompt: the characters alone, side by side ("shapes
// only"), each over a short bar in its model's colour, and an envelope flying between two
// while one speaks. It grows sideways up to BAND_MAX; the caller puts the coordinator and
// the agents at work first, so past that only finished ones are left out.
const SLOT_W = 40
const MORE_W = 34
const BAND_H = 44
export const BAND_MAX = 13
export const BAND_HEIGHT = BAND_H
export function bandWidth(count: number): number {
  const shown = Math.min(count, BAND_MAX)
  return shown * SLOT_W + (count > shown ? MORE_W : 0)
}

export function bandSvg(list: CrewAgent[], flying: CrewMessage | undefined): string {
  const shown = list.slice(0, BAND_MAX)
  const extra = list.length - shown.length
  const width = bandWidth(list.length)
  const slots = shown
    .map((agent, i) => {
      const x = i * SLOT_W
      const look = modelLook(agent.model)
      return `<g transform="translate(${x} 0)">
        <g transform="scale(0.5)">${mascot(agent, false)}</g>
        <rect x="11" y="35" width="${SLOT_W - 22}" height="2.5" rx="1.25" fill="${look.color}"/>
      </g>`
    })
    .join('')
  let envelope = ''
  if (flying) {
    const a = shown.findIndex(x => x.id === flying.from)
    const b = shown.findIndex(x => x.id === flying.to)
    if (a >= 0 && b >= 0 && a !== b) {
      const x1 = a * SLOT_W + SLOT_W / 2
      const x2 = b * SLOT_W + SLOT_W / 2
      const path = `M${x1} 4 Q${(x1 + x2) / 2} -6 ${x2} 4`
      envelope = `<path d="${path}" fill="none" class="line" stroke-width="1.2" stroke-dasharray="3 4"/>
        <g><rect x="-7" y="-5" width="14" height="10" rx="1.5" fill="#F2C230"/>
          <path d="M-7 -5 l7 5 l7 -5" fill="none" stroke="#B88A14" stroke-width="1"/>
          <animateMotion dur="1.4s" repeatCount="indefinite" path="${path}"/></g>`
    }
  }
  const more = extra > 0
    ? `<text x="${shown.length * SLOT_W + 4}" y="26" font-size="13" font-weight="700" class="dim">+${extra}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -6 ${width} ${BAND_H}" width="${width}" height="${BAND_H}">
    ${STYLE}${slots}${envelope}${more}
  </svg>`
}


function levelColor(percent: number): string {
  return percent >= 85 ? '#D64545' : percent >= 60 ? '#D99A1E' : '#2E9E6B'
}

function resetIn(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const min = Math.max(0, Math.round((at - now) / 60000))
  if (min < 60) return t('minutesOnly', { n: min })
  const h = Math.floor(min / 60)
  return h < 48 ? t('hoursOnly', { n: h }) : t('days', { n: Math.round(h / 24) })
}

export type UsageView = {
  contextPercent?: number
  contextTokens?: number
  contextWindow?: number
  limits: { kind: string; percent: number; resetsAt?: string }[]
  usd?: number
}

function kTokens(n: number): string {
  return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

// The strip under the prompt: the context window, each rate-limit window
// with when it resets, and what the session has cost.
const CELL_W = 124
const COST_W = 64

// One bar, split in cells read right to left: the week, the 5-hour window,
// the context; the cost after it. Each cell fills to its percentage; the
// reset time is the cell's tooltip.
export function usageSvg(u: UsageView, now: number): { source: string; width: number } {
  const week = u.limits.find(l => l.kind === 'seven_day')
  const day = u.limits.find(l => l.kind === 'five_hour')
  const cells: { label: string; percent?: number; tip: string }[] = [
    { label: t('labelWeek'), percent: week?.percent, tip: week?.resetsAt ? t('resetsIn', { time: resetIn(week.resetsAt, now) }) : t('noReading') },
    { label: t('labelDay'), percent: day?.percent, tip: day?.resetsAt ? t('resetsIn', { time: resetIn(day.resetsAt, now) }) : t('fiveHourLimit') },
    {
      label: t('context'),
      percent: u.contextPercent,
      tip: u.contextTokens !== undefined && u.contextWindow ? t('tokensOf', { used: kTokens(u.contextTokens), total: kTokens(u.contextWindow) }) : t('afterFirstReply'),
    },
  ]
  const barW = cells.length * CELL_W
  const width = barW + (u.usd !== undefined ? COST_W + 8 : 0)
  const barX = width - barW
  const drawn = cells
    .map((c, i) => {
      // i = 0 is the rightmost cell.
      const x = barX + barW - (i + 1) * CELL_W
      const p = c.percent === undefined ? undefined : Math.max(0, Math.min(100, c.percent))
      const fillW = p === undefined ? 0 : Math.max(p > 0 ? 3 : 0, ((CELL_W - 2) * p) / 100)
      const text = p === undefined ? `${c.label} —` : `${c.label} ${Math.round(p)}%`
      return `<g><title>${esc(c.tip)}</title>
        <rect x="${x + 1 + (CELL_W - 2) - fillW}" y="1" width="${fillW}" height="20" fill="${p === undefined ? 'none' : levelColor(p)}" opacity="0.32"/>
        <text x="${x + CELL_W / 2}" y="15" font-size="11.5" class="ink" text-anchor="middle">${esc(text)}</text>
      </g>`
    })
    .join('')
  const dividers = [1, 2]
    .map(k => `<line x1="${barX + k * CELL_W}" y1="4" x2="${barX + k * CELL_W}" y2="18" class="line" stroke-width="1"/>`)
    .join('')
  const cost = u.usd !== undefined
    ? `<text x="${COST_W / 2}" y="15" font-size="12" font-weight="650" class="ink" text-anchor="middle">$${u.usd.toFixed(2)}</text>`
    : ''
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 22" width="${width}" height="22">
    ${STYLE}
    <clipPath id="pill"><rect x="${barX}" y="1" width="${barW}" height="20" rx="10"/></clipPath>
    <rect x="${barX}" y="1" width="${barW}" height="20" rx="10" class="card" stroke-width="1"/>
    <g clip-path="url(#pill)">${drawn}</g>
    ${dividers}${cost}
  </svg>`
  return { source, width }
}
