// The person's crew: ~/.claude/crew/config.json, written by the prompt the setup page gives.
// It is read as untrusted input: every field is checked and cut to size, because the names
// and jobs reach the cards, the agents' prompts and this session's system prompt.
import type { EngineInterface } from 'claude-code'

import type { CrewConfig, CrewConnection, CrewConnectionKind, CrewLook, CrewMember } from '../types'

export const LOOKS: readonly CrewLook[] = ['captain', 'bow', 'cat', 'music', 'helmet', 'hologram', 'pink', 'scarf']
const MODELS: readonly CrewMember['model'][] = ['haiku', 'sonnet', 'opus']
const EFFORTS: readonly CrewMember['effort'][] = ['low', 'medium', 'high']
const KINDS: readonly CrewConnectionKind[] = ['claude', 'codex', 'gemini', 'cursor', 'other']

const MAX_NAME = 32
const MAX_JOB = 200
const MAX_MEMBERS = 12
const MAX_CONNECTIONS = 8

/** A slash-free home, on Windows and elsewhere; undefined when neither variable is set. */
export async function homeOf($: EngineInterface): Promise<string | undefined> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? home.replace(/\\/g, '/').replace(/\/$/, '') : undefined
}

export const crewDir = (home: string): string => `${home}/.claude/crew`

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''

const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback

const slug = (value: unknown): string => (typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,31}$/.test(value) ? value : '')

function records(value: unknown, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object').slice(0, max)
}

/** A clean config from whatever the file held, or undefined when it holds no crew at all. */
export function normalizeConfig(raw: unknown): CrewConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Record<string, unknown>
  const lead = (source.lead ?? {}) as Record<string, unknown>
  const seen = new Set(['lead'])
  const fresh = (id: string): boolean => {
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  }

  const members: CrewMember[] = []
  for (const row of records(source.members, MAX_MEMBERS)) {
    const id = slug(row.id)
    const name = text(row.name, MAX_NAME)
    if (!name || !fresh(id)) continue
    members.push({
      id,
      name,
      look: oneOf(row.look, LOOKS, 'bow'),
      model: oneOf(row.model, MODELS, 'haiku'),
      effort: oneOf(row.effort, EFFORTS, 'medium'),
      job: text(row.job, MAX_JOB),
    })
  }

  const connections: CrewConnection[] = []
  for (const row of records(source.connections, MAX_CONNECTIONS)) {
    const id = slug(row.id)
    const name = text(row.name, MAX_NAME)
    if (!name || !fresh(id)) continue
    connections.push({ id, name, look: oneOf(row.look, LOOKS, 'hologram'), kind: oneOf(row.kind, KINDS, 'other') })
  }

  return {
    language: source.language === 'ar' ? 'ar' : 'en',
    lead: { name: text(lead.name, MAX_NAME) || 'Lead', look: oneOf(lead.look, LOOKS, 'captain') },
    members,
    connections,
  }
}

export async function loadConfig($: EngineInterface, home: string): Promise<CrewConfig | undefined> {
  try {
    return normalizeConfig(JSON.parse(await $.fs.read(`${crewDir(home)}/config.json`)))
  } catch {
    return undefined
  }
}

// A worker's whole system prompt: the agent runs on its own, without the session's.
export function memberPrompt(member: CrewMember, config: CrewConfig): string {
  return [
    `You are ${member.name}, a delegated worker on a crew led by ${config.lead.name}.`,
    member.job ? `Your usual work: ${member.job}` : '',
    'Do exactly the task in the prompt, in the files it names, and nothing else.',
    'Follow the repository\'s own rules (CLAUDE.md, AGENTS.md). Do not commit unless the prompt says so.',
    'Run only the tests you touched, and stop any server or browser you start before you report.',
    'End with a short, exact report: what you changed (file:line), what you checked, and what you could not verify.',
  ].filter(Boolean).join('\n')
}

// What the coordinating session knows about its crew, added to its system prompt.
export function crewSection(config: CrewConfig, home: string): string {
  const lines = [
    '# Crew',
    `The person named this session ${config.lead.name}, the crew's lead. Answer to that name.`,
  ]
  if (config.members.length > 0) {
    lines.push('Subagents you can delegate to with the Agent tool:')
    for (const m of config.members) {
      lines.push(`- ${m.name}: subagent_type "crew:${m.id}", ${m.model} at ${m.effort} effort${m.job ? ` (${m.job})` : ''}`)
    }
  }
  const codex = config.connections.filter(c => c.kind === 'codex')
  const others = config.connections.filter(c => c.kind !== 'codex')
  for (const c of codex) {
    lines.push(
      `${c.name} is Codex, and you run it yourself: never send the person to it. Follow "Running Codex" in ${crewDir(home)}/HANDSHAKE.md.`,
      'If Codex CLI is missing or signed out, tell the person to run `npm install -g @openai/codex` and `codex login` once.',
    )
  }
  if (others.length > 0) {
    lines.push(
      'Other agents connected through shared files, which you cannot message directly:',
      ...others.map(c => `- ${c.name}: id "${c.id}", ${c.kind}`),
      `To give one a task, follow ${crewDir(home)}/HANDSHAKE.md: add a row to bus/tasks.json with its id in "to", then tell the person to ask that agent to check its crew tasks.`,
    )
  }
  return lines.join('\n')
}
