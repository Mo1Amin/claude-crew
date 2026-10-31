import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, AgentSpawnResult, EngineInterface, Register, SessionSendInput } from 'claude-code'

import type { CrewAgent, CrewConfig, CrewConnectionKind, CrewMessage, CrewPeer, CrewRole, CrewTask, CrewUsage } from '../types'
import { ONLINE_MS, boardHtml, busDir, heartbeat, parseRole, readPeers, readTasks, taskLine } from './bus'
import { BAND_HEIGHT, CARD_H, CARD_W, MSG_H, bandSvg, bandWidth, cardSvg, clip, emptySvg, messageSvg, modelLook, pickOutfit, taskOf, titled, usageSvg } from './art'
import { crewDir, crewSection, homeOf, loadConfig, memberPrompt } from './config'
import { characterOf, connectionOf, personaFor, setCast } from './personas'
import { openSetup } from './setup'
import { setLanguage, t, verbs } from './strings'

const PANE = 'crew'
const MAIN = 'main'
const SPEAK_MS = 9000
const MAX_CARDS = 8
const MAX_MESSAGES = 6

const agents = atom({ plugin: 'crew', key: 'agents' } as const, {} as Record<string, CrewAgent>)
const order = atom({ plugin: 'crew', key: 'order' } as const, [] as string[])
const messages = atom({ plugin: 'crew', key: 'messages' } as const, [] as CrewMessage[])
const speaking = atom({ plugin: 'crew', key: 'speaking' } as const, {} as Record<string, string>)
const usage = atom({ plugin: 'crew', key: 'usage' } as const, { limits: [] } as CrewUsage)
const tasks = atom({ plugin: 'crew', key: 'tasks' } as const, [] as CrewTask[])
const peers = atom({ plugin: 'crew', key: 'peers' } as const, {} as Record<string, CrewPeer>)
const me = atom({ plugin: 'crew', key: 'me' } as const, { role: 'lead', account: '1' } as CrewRole)
const crew = atom({ plugin: 'crew', key: 'config' } as const, null as CrewConfig | null)

function usageFrom(u: {
  context: { percent?: number; tokens?: number; window: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  cost?: { usd: number }
}): CrewUsage {
  return {
    contextPercent: u.context.percent,
    contextTokens: u.context.tokens,
    contextWindow: u.context.window,
    limits: u.rateLimits.map(r => ({ kind: r.kind, percent: r.percentUsed, resetsAt: r.resetsAt })),
    usd: u.cost?.usd,
  }
}

// Everyone finished: a short chime and a notification. The engine's own
// player plays nothing on Windows, so there it goes through PowerShell.
async function allDone($: EngineInterface): Promise<void> {
  try {
    await $.ui.notify(t('allDone'), { title: t('title') })
  } catch {
    // Notifications off: the chime still plays.
  }
  try {
    if ((await $.env.get('OS')) === 'Windows_NT') {
      const wav = `${$.plugin.root}/sounds/done.wav`.replace(/'/g, "''")
      await $.process.run(['powershell', '-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${wav}').PlaySync()`])
    } else {
      await $.audio.play({ asset: 'sounds/done.wav' })
    }
  } catch {
    // No player: the notification is enough.
  }
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: t('title') }).catch(() => undefined)

function verbFor(tool: string, input: unknown): string {
  const verb = verbs()[tool] ?? tool.replace(/^mcp__[^_]+__/, '')
  const args = (input ?? {}) as Record<string, unknown>
  const path = typeof args.file_path === 'string' ? args.file_path : undefined
  if (path) return `${verb} ${path.split(/[\\/]/).pop()}`
  if (typeof args.pattern === 'string') return `${verb} «${clip(args.pattern, 18)}»`
  return verb
}

function familyOf(model: string): string {
  const m = model.toLowerCase()
  return m.includes('haiku') ? 'haiku' : m.includes('sonnet') ? 'sonnet' : m.includes('opus') ? 'opus' : 'other'
}

// A stored agent with no character (stored before setup, or named for none) is drawn with
// the one its model gives. Only the drawn copy changes; nothing is written back.
function drawn(a: CrewAgent): CrewAgent {
  if (a.isMain) return { ...a, persona: characterOf('lead') ? 'lead' : undefined }
  if (a.persona) return a
  const persona = personaFor({ id: a.id, name: a.name, model: a.model })
  return persona ? { ...a, persona } : a
}

async function patch($: EngineInterface, id: string, change: Partial<CrewAgent>): Promise<void> {
  await update($, agents, all => (all[id] ? { ...all, [id]: { ...all[id], ...change } } : all))
}

async function ensureMain($: EngineInterface, model?: string): Promise<void> {
  const now = await $.clock.now()
  const persona = characterOf('lead') ? 'lead' : undefined
  await update($, agents, all => {
    const main = all[MAIN]
    if (main) {
      const change = (model && main.model !== model) || main.persona !== persona
      return change ? { ...all, [MAIN]: { ...main, ...(model ? { model } : {}), persona } } : all
    }
    const lead: CrewAgent = {
        id: MAIN,
        name: 'Claude',
        kind: 'main',
        model: model ?? '',
        outfit: 'crown',
        status: 'running',
        startedAt: now,
        isMain: true,
        persona,
    }
    return { ...all, [MAIN]: lead }
  })
  await update($, order, ids => (ids.includes(MAIN) ? ids : [MAIN, ...ids]))
}

// Agents outside this session: another Claude account, or a connected agent of any maker.
// Each adds a row to ~/.claude/crew/agents.json; its exit file appears when it ends.
type AgentRow = { id: string; name: string; model: string; effort?: string; log: string; exit: string; startedAt: number; account?: string; persona?: string }

const KIND_NAME: Record<CrewConnectionKind, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', cursor: 'Cursor', other: 'Agent' }

const CODEX_EVENT = {
  command_execution: 'codexCommand',
  file_change: 'codexFiles',
  reasoning: 'codexThinking',
  agent_message: 'codexReply',
  web_search: 'codexSearch',
} as const

async function codexActivity($: EngineInterface, log: string): Promise<string | undefined> {
  try {
    const { size } = await $.fs.stat(log)
    if (size > 3_500_000) return undefined
    const lines = (await $.fs.read(log)).trimEnd().split('\n')
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 20; i--) {
      const kind = /"item":\{[^}]*?"type":"([a-z_]+)"/.exec(lines[i] ?? '')?.[1]
      const word = CODEX_EVENT[kind as keyof typeof CODEX_EVENT]
      if (word) return t(word)
    }
  } catch {
    // No log yet: it is still starting.
  }
  return undefined
}

async function lastLogLine($: EngineInterface, log: string): Promise<string | undefined> {
  try {
    const line = (await $.fs.read(log)).trimEnd().split('\n').pop()?.trim()
    return line && !line.startsWith('{') ? clip(line, 60) : undefined
  } catch {
    return undefined
  }
}

/** Rows cleared from the pane leave the shared list too, so neither side shows them again. */
async function dropAgentRows($: EngineInterface, ids: Set<string>): Promise<void> {
  const home = await homeOf($)
  if (!home || ids.size === 0) return
  const list = `${crewDir(home)}/agents.json`
  try {
    const rows = JSON.parse(await $.fs.read(list)) as AgentRow[]
    const kept = rows.filter(r => !ids.has(`row:${r.id}`))
    if (kept.length !== rows.length) await $.fs.write(list, JSON.stringify(kept, null, 2))
  } catch {
    // No list: nothing to drop.
  }
}

let lastBoard = ''
let lastConfig = ''

// The file is read every few seconds, so a crew written by the setup prompt takes hold at once.
async function syncConfig($: EngineInterface, home: string): Promise<void> {
  const next = await loadConfig($, home)
  const key = JSON.stringify(next ?? null)
  if (key === lastConfig) return
  lastConfig = key
  setCast(next)
  setLanguage(next?.language ?? 'en')
  await update($, crew, () => next ?? null)
  if (!next) return
  await ensureMain($)
  for (const member of next.members) {
    await $.agent
      .register({
        name: member.id,
        description: `${member.name}${member.job ? ': ' + member.job : ''}`,
        prompt: memberPrompt(member, next),
        model: member.model,
        effort: member.effort,
      })
      .catch(() => undefined)
  }
}

async function runSetup($: EngineInterface): Promise<string> {
  const home = await homeOf($)
  if (!home) return t('setupFailed', { path: '~/.claude/crew/setup.html' })
  try {
    const { path, isOpen } = await openSetup($, home, (await read($, crew)) ?? undefined)
    return t(isOpen ? 'setupOpened' : 'setupFailed', { path })
  } catch {
    return t('setupFailed', { path: `${crewDir(home)}/setup.html` })
  }
}

async function syncBus($: EngineInterface, home: string, cwd: string): Promise<void> {
  try {
    await heartbeat($, home, await read($, me), cwd)
    const [t, p] = await Promise.all([readTasks($, home), readPeers($, home)])
    await update($, tasks, prev => (JSON.stringify(prev) === JSON.stringify(t) ? prev : t))
    await update($, peers, prev => (JSON.stringify(prev) === JSON.stringify(p) ? prev : p))
    const helpers = Object.values(await read($, agents))
      .filter(a => !a.isMain)
      .map(a => ({ name: a.name, model: a.model, status: a.status, activity: a.activity }))
    // Rewritten when what it shows changes, or every half minute so "online" stays true.
    const now = await $.clock.now()
    const key = JSON.stringify([t, helpers, Object.values(p).map(x => [x.account, x.role, x.name, now - x.at < 15000]), Math.floor(now / 30000)])
    if (key !== lastBoard) {
      lastBoard = key
      await $.fs.write(`${busDir(home)}/board.html`, boardHtml(p, t, helpers, now))
    }
  } catch {
    // The bus folder could not be written this time: the next tick tries again.
  }
}

async function syncRows($: EngineInterface, list: string): Promise<void> {
  let rows: AgentRow[]
  try {
    rows = JSON.parse(await $.fs.read(list)) as AgentRow[]
    if (!Array.isArray(rows)) return
  } catch {
    return
  }
  // This session's own account writes its rows here too, but its agents (and its lead, the
  // main card) are already drawn from this session's events: they would show twice.
  // Its rows are skipped, and any card an earlier sync made of one is taken off.
  const account = (await read($, me)).account
  const ownRow = (r: AgentRow) => (r.account ?? /^acc(\d+)-/.exec(r.id)?.[1]) === account
  const own = new Set(rows.filter(ownRow).map(r => `row:${r.id}`))
  const stale = (a: CrewAgent) => a.id.startsWith('row:') && (own.has(a.id) || a.account === account)
  const gone = new Set(Object.values(await read($, agents)).filter(stale).map(a => a.id))
  if (gone.size > 0) {
    await update($, agents, all => {
      const rest = { ...all }
      gone.forEach(id => delete rest[id])
      return rest
    })
    await update($, order, ids => ids.filter(id => !gone.has(id)))
  }
  for (const row of rows) {
    if (ownRow(row)) continue
    const id = `row:${row.id}`
    let status: CrewAgent['status'] = 'running'
    let endedAt: number | undefined
    if (await $.fs.exists(row.exit)) {
      const code = (await $.fs.read(row.exit).catch(() => '1')).trim()
      status = code === '0' ? 'done' : 'failed'
      endedAt = (await $.fs.stat(row.exit).catch(() => undefined))?.mtimeMs ?? row.startedAt
    }
    // Another Claude account writes rows here too: it dresses like this session's own
    // agents, by model. Everyone else is a connected agent.
    const claudeAccount = row.account ?? /^acc(\d+)-/.exec(row.id)?.[1]
    const isClaude = claudeAccount !== undefined
    // A named persona draws the agent itself, so it is not forced into the robot outfit.
    const persona = personaFor({ persona: row.persona, id: row.id, name: row.name, model: row.model })
    const activity = status !== 'running' ? undefined : (await codexActivity($, row.log)) ?? (await lastLogLine($, row.log))
    const maker = isClaude ? `${t('account')} ${claudeAccount}` : KIND_NAME[connectionOf(persona)?.kind ?? 'other']
    const kind = `${maker}${row.effort ? ' · ' + row.effort : ''}`
    await update($, agents, all => {
      const known = all[id]
      if (known && known.status === status && known.activity === activity && known.persona === persona) return all
      const family = familyOf(row.model)
      const nth = Object.values(all).filter(a => !a.isMain && a.id !== id && a.outfit !== 'robot' && familyOf(a.model) === family).length
      const kept = known && !(isClaude && known.outfit === 'robot') ? known.outfit : undefined
      const robotOutfit = !isClaude && persona === undefined
      const outfit = kept ?? (robotOutfit ? 'robot' : row.id.endsWith('-lead') ? 'crown' : pickOutfit(row.model, nth))
      const agent: CrewAgent = {
        id, name: row.name, kind, model: row.model, outfit, status, activity,
        startedAt: row.startedAt, endedAt, persona, account: claudeAccount,
      }
      return { ...all, [id]: agent }
    })
    await update($, order, ids => (ids.includes(id) ? ids : [...ids, id]))
  }
}

// A message end's name: the agent's (persona first), or the raw address when it is not on the crew.
const nameOf = (agent: CrewAgent | undefined, fallback: string): string => (agent ? titled(agent) : fallback)

// SendMessage spells its recipient as a name, an agent id or an address.
function resolveRecipient(all: Record<string, CrewAgent>, to: string): string {
  if (to === 'main' || to === 'team-lead' || to === 'parent') return MAIN
  if (all[to]) return to
  const hit = Object.values(all).find(a => a.address === to || a.name === to)
  return hit?.id ?? to
}

// A new agent's card. Kept apart so a failure here leaves the spawn's own result intact.
async function track($: EngineInterface, e: AgentSpawnInput, result: Extract<AgentSpawnResult, { deny?: undefined }>, agentId: string): Promise<void> {
  const now = await $.clock.now()
  await ensureMain($, e.parentModel)
  const model = result.model || e.model || e.parentModel
  await update($, agents, all => {
    const known = all[agentId]
    if (known) return { ...all, [agentId]: { ...known, status: 'running' as const, endedAt: undefined } }
    const family = familyOf(model)
    const nth = Object.values(all).filter(a => !a.isMain && familyOf(a.model) === family).length
    const agent: CrewAgent = {
      id: agentId,
      name: e.description || e.name || e.subagentType || 'agent',
      address: e.name,
      kind: e.isTeammate ? 'teammate' : e.fork ? 'fork' : e.subagentType || 'agent',
      model,
      outfit: pickOutfit(model, nth),
      status: 'running',
      startedAt: now,
      persona: personaFor({ subagentType: e.subagentType, name: e.description || e.name, model, id: agentId }),
    }
    return { ...all, [agentId]: agent }
  })
  await update($, order, ids => (ids.includes(agentId) ? ids : [...ids, agentId]))
}

// The envelope card and the speech bubble. A failure here never undoes the delivery.
async function note($: EngineInterface, e: SessionSendInput): Promise<void> {
  const now = await $.clock.now()
  const from = e.agentId ?? MAIN
  const all = await read($, agents)
  const to = resolveRecipient(all, e.to)
  const msg: CrewMessage = { id: `${now}-${from}`, from, to, text: e.text, at: now }
  await update($, messages, list => [...list, msg].slice(-MAX_MESSAGES))
  await update($, speaking, map => ({ ...map, [from]: e.text }))
  $.clock.after(SPEAK_MS, () => {
    void update($, speaking, map => {
      if (map[from] !== e.text) return map
      const rest = { ...map }
      delete rest[from]
      return rest
    })
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const home = await homeOf($)
    if (home) await syncConfig($, home).catch(() => undefined)
    await $.command.register({ name: 'crew', description: t('cmdCrew') })
    await $.command.register({ name: 'crew-setup', description: t('cmdSetup') })
    await $.command.register({ name: 'crew-role', description: t('cmdRole') })
    await $.command.register({ name: 'crew-sound', description: t('cmdSound') })
    try {
      const now = usageFrom(await $.session.usage())
      await update($, usage, () => now)
    } catch {
      // No figures yet: the strip says so until the first response.
    }
    // The pane stays open on the right from the start.
    void openPane($)
    // First run: the setup page opens once, and only with a person there to use it.
    if (e.isInteractive && !(await read($, crew)) && !(await $.store.get('crew.setupShown'))) {
      await $.store.set('crew.setupShown', true)
      void $.ui.toast(t('setupWelcome'))
      void runSetup($)
    }
    if (home) {
      const list = `${crewDir(home)}/agents.json`
      void syncRows($, list)
      $.clock.every(4000, () => { void syncRows($, list) })
      // The bus between sessions: this session's heartbeat, the tasks, the board page.
      // Keyed by this session: the store is shared by every session on the PC.
      const key = `crew.me.${await $.session.id()}`
      const saved = (await $.store.get(key)) as CrewRole | undefined
      if (saved && (saved.role === 'lead' || saved.role === 'worker')) await update($, me, () => saved)
      const tick = () => {
        void syncConfig($, home).catch(() => undefined)
        void syncBus($, home, e.cwd)
      }
      tick()
      $.clock.every(4000, tick)
    }
    return next(e)
  })

  on('command.run', { command: 'crew-sound' }, async $ => {
    await allDone($)
    return { text: t('soundPlayed') }
  })

  on('command.run', { command: 'crew-setup' }, async $ => ({ text: await runSetup($) }))

  on('command.run', { command: 'crew-role' }, async ($, e) => {
    const next = parseRole(e.args, await read($, me))
    if (typeof next === 'string') return { text: next }
    await update($, me, () => next)
    await $.store.set(`crew.me.${await $.session.id()}`, next)
    return { text: t('roleSet', { role: t(next.role), account: next.account }) }
  })

  on('command.run', { command: 'crew' }, async $ => {
    await openPane($)
    return { text: t('paneOpened') }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await ensureMain($)
      await patch($, MAIN, { status: 'running', activity: undefined })
    } else {
      await patch($, e.agentId, { status: 'running', endedAt: undefined })
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    const model = e.usage?.model
    if (e.agentId === undefined) {
      await ensureMain($, model)
      await patch($, MAIN, { status: 'idle', activity: undefined })
      // The main turn ended with nobody still at work: the whole task is done.
      // Short replies stay quiet; only a turn of real work rings.
      const working = Object.values(await read($, agents)).filter(a => !a.isMain && a.status === 'running')
      if (working.length === 0 && !e.isAborted && e.durationMs >= 20000) void allDone($)
    } else {
      const failed = e.reason === 'error' || e.reason === 'aborted' || e.reason === 'refusal'
      const all = await read($, agents)
      const agent = all[e.agentId]
      if (agent) {
        const wasRunning = agent.status === 'running'
        await patch($, e.agentId, {
          status: failed ? 'failed' : agent.kind === 'teammate' ? 'idle' : 'done',
          endedAt: now,
          activity: undefined,
          ...(model ? { model } : {}),
        })
        const left = Object.values(await read($, agents)).filter(a => !a.isMain && a.status === 'running')
        if (wasRunning && left.length === 0) void allDone($)
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if ('deny' in result && result.deny !== undefined) return result
    const agentId = e.resume?.agentId ?? result.agentId
    if (!agentId) return result
    await track($, e, result, agentId).catch(() => undefined)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    try {
      const all = await read($, agents)
      if (all[id]) await patch($, id, { activity: verbFor(String(e.tool), e) })
    } catch {
      // The pane is decoration: a failed write never holds up the tool.
    }
    return next(e)
  })

  on('session.send', async ($, e, next) => {
    const result = await next(e)
    if (!result.isDelivered) return result
    await note($, e).catch(() => undefined)
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => usageFrom(e))
    return next(e)
  })

  // The lead's name and the crew's subagents, in the system prompt of every model request.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const config = await read($, crew)
    const home = await homeOf($)
    if (!config || !home) return result
    return { sections: [...result.sections, { id: 'crew:team', text: crewSection(config, home), scope: 'session' as const }] }
  })

  // Above the prompt: the agents at work, each with its model's name. The big
  // pane opens only from the button here (or /crew).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const all = await read($, agents)
    const ids = await read($, order)
    const said = await read($, speaking)
    const log = await read($, messages)
    const u = await read($, usage)
    const now = await $.clock.now()
    await read($, crew) // A new crew redraws the band.
    const list = ids
      .map(id => all[id])
      .filter((a): a is CrewAgent => a !== undefined)
      .map(a => drawn(a))
    // Always shown: the coordinator first, then the agents at work, then the
    // most recent finished ones, so the row never empties between tasks.
    const rank = (a: CrewAgent) => (a.status === 'running' || said[a.id] !== undefined ? 0 : a.status === 'idle' ? 1 : 2)
    const helpers = list
      .filter(a => !a.isMain)
      .sort((a, b) => rank(a) - rank(b) || (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    const main: CrewAgent = list.find(a => a.isMain) ?? drawn({
      id: MAIN, name: 'Claude', kind: 'main', model: '', outfit: 'crown', status: 'idle', startedAt: now, isMain: true,
    })
    const team = [main, ...helpers]
    const flying = [...log].reverse().find(m => said[m.from] === m.text)
    const { Box, Text, Button } = $.ui.resolve(e)
    const press = () => openPane($)
    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="row" gap={2}>
          {team.map(a => (
            <Text>
              {a.isMain ? '👑' : '●'} {clip(a.name, 16)} <Text bold>{modelLook(a.model).label}</Text>
            </Text>
          ))}
          <Button key="open" plain onPress={press}>{t('details')}</Button>
        </Box>
      )
    }
    const { Svg } = $.ui.resolve(e)
    const strip = usageSvg(u, now)
    return (
      <Box flexDirection="column" gap={0}>
        {(
          <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={0}>
            <Svg
              source={bandSvg(team, flying)}
              width={bandWidth(team.length)}
              height={BAND_HEIGHT}
              alt={team.map(a => `${titled(a)} (${modelLook(a.model).label})`).join(', ')}
              isInteractive
            />
            <Button key="open" plain onPress={press}>{t('details')} ›</Button>
          </Box>
        )}
        <Svg source={strip.source} width={strip.width} height={22} alt={`${t('context')} ${u.contextPercent ?? '—'}%`} isInteractive />
      </Box>
    )
  })

  // Under the prompt, in the footer beside the modes: context fill, the
  // rate-limit windows with their reset, and the cost.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const u = await read($, usage)
    if (e.surface !== 'desktop') {
      const bits = [
        u.contextPercent !== undefined ? `${t('contextShort')} ${u.contextPercent}%` : undefined,
        ...u.limits.map(l => `${l.kind === 'five_hour' ? t('fiveHours') : l.kind === 'seven_day' ? t('week') : l.kind} ${Math.round(l.percent)}%`),
        u.usd !== undefined ? `$${u.usd.toFixed(2)}` : undefined,
      ].filter((b): b is string => b !== undefined)
      return next({ ...e, props: { ...e.props, modes: [...e.props.modes, bits.join(' · ')] } })
    }
    const now = await $.clock.now()
    const { Box, Text, Svg } = $.ui.resolve(e)
    const strip = usageSvg(u, now)
    return (
      <Box flexDirection="row" alignItems="center" gap={2}>
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')}</Text>}
        <Svg source={strip.source} width={strip.width} height={22} alt={`${t('context')} ${u.contextPercent ?? '—'}%`} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    if (e.surface === 'terminal') {
      return <Text dimColor>{t('paneTerminal')}</Text>
    }
    const { Svg } = $.ui.resolve(e)
    const all = await read($, agents)
    const ids = await read($, order)
    const said = await read($, speaking)
    const log = await read($, messages)
    const now = await $.clock.now()
    const mine = await read($, me)
    const config = await read($, crew)
    const peerList = Object.values(await read($, peers)).sort((a, b) => a.account.localeCompare(b.account))
    const taskList = (await read($, tasks)).slice(-5).reverse()

    const rank = (a: CrewAgent) => (a.isMain ? 0 : a.status === 'running' ? 1 : a.status === 'idle' ? 2 : 3)
    // The agents as they are drawn: a stored one with no character gets its character here.
    const look = (id: string) => (all[id] ? drawn(all[id]) : undefined)
    const list = ids
      .map(id => look(id))
      .filter((a): a is CrewAgent => a !== undefined)
      .sort((a, b) => rank(a) - rank(b) || (b.endedAt ?? 0) - (a.endedAt ?? 0))
    const helpers = list.filter(a => !a.isMain)
    const running = helpers.filter(a => a.status === 'running').length
    const finished = helpers.filter(a => a.status === 'done' || a.status === 'failed').length
    const shown = list.slice(0, MAX_CARDS)

    const clearFinished = async () => {
      const gone = new Set(
        Object.values(await read($, agents))
          .filter(a => !a.isMain && (a.status === 'done' || a.status === 'failed'))
          .map(a => a.id),
      )
      await update($, agents, map => {
        const rest = { ...map }
        gone.forEach(id => delete rest[id])
        return rest
      })
      await update($, order, o => o.filter(id => !gone.has(id)))
      await update($, messages, m => m.filter(x => !gone.has(x.from) && !gone.has(x.to)))
      await dropAgentRows($, gone)
    }

    const summary = helpers.length === 0 ? t('alone') : t('summary', { running, finished })
    const setUp = async () => { $.ui.toast(await runSetup($)) }

    return (
      <Box flexDirection="column" gap={0}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
          <Text bold>{summary}</Text>
          {finished > 0 && (
            <Button key="clear" plain onPress={clearFinished}>
              {t('clearFinished')}
            </Button>
          )}
        </Box>
        {!config && <Button key="setup" onPress={setUp}>{t('setupButton')}</Button>}
        {helpers.length === 0 && <Svg source={emptySvg()} alt={t('noAgents')} width={CARD_W} height={120} isInteractive />}
        {shown.map(agent => (
          <Svg
            source={cardSvg(agent, said[agent.id], now)}
            width={CARD_W}
            height={CARD_H}
            alt={`${[titled(agent), taskOf(agent)].filter(Boolean).join(' · ')} — ${modelLook(agent.model).label} — ${agent.status}`}
            isInteractive
          />
        ))}
        {list.length > shown.length && <Text dimColor>{t('others', { count: list.length - shown.length })}</Text>}
        {peerList.length > 0 && <Box marginTop={1}><Text bold>{t('sessions')}</Text></Box>}
        {peerList.map(p => (
          <Text key={`peer-${p.account}`} dimColor={now - p.at >= ONLINE_MS}>
            {`${t('account')} ${p.account} · ${t(p.role)}${p.name ? ' · ' + p.name : ''} · ${t(now - p.at < ONLINE_MS ? 'online' : 'offline')}${p.account === mine.account ? ' ' + t('thisSession') : ''}`}
          </Text>
        ))}
        {taskList.length > 0 && <Box marginTop={1}><Text bold>{t('tasks')}</Text></Box>}
        {taskList.map(t => <Text key={`task-${t.id}`}>{taskLine(t)}</Text>)}
        {log.length > 0 && <Box marginTop={1}><Text bold>{t('messages')}</Text></Box>}
        {log
          .slice(-3)
          .reverse()
          .map(msg => (
            <Svg
              source={messageSvg(msg, look(msg.from), look(msg.to))}
              width={CARD_W}
              height={MSG_H}
              alt={`${nameOf(look(msg.from), msg.from)} ← ${nameOf(look(msg.to), msg.to)}: ${clip(msg.text, 60)}`}
              isInteractive
            />
          ))}
      </Box>
    )
  })
}
