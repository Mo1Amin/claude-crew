import { expect, mock, test } from 'claude-code/testing'

import type { CrewConfig } from '../types'
import { bandSvg, cardSvg, taskOf, titled } from './art'
import { LOOKS, crewSection, memberPrompt, normalizeConfig } from './config'
import { characterOf, personaFor, setCast } from './personas'
import { fillPage } from './setup'
import { setLanguage, t } from './strings'

const CONFIG: CrewConfig = {
  language: 'ar',
  lead: { name: 'القبطان', look: 'captain' },
  members: [
    { id: 'nova', name: 'نوفا', look: 'bow', model: 'haiku', effort: 'medium', job: 'small tasks' },
    { id: 'atlas', name: 'Atlas', look: 'helmet', model: 'sonnet', effort: 'high', job: '' },
  ],
  connections: [{ id: 'codex', name: 'Sol', look: 'hologram', kind: 'codex' }],
}

const agentOf = (persona: string | undefined, name: string) => ({
  id: 'a1', name, kind: 'agent', model: 'claude-haiku-5-5', outfit: 'cap' as const, status: 'running' as const, startedAt: 0, persona,
})

test('a config keeps its crew and drops what is not valid', async () => {
  const config = normalizeConfig({
    language: 'ar',
    lead: { name: '  Boss\n\n', look: 'nope' },
    members: [
      { id: 'one', name: 'One', look: 'cat', model: 'opus', effort: 'high', job: 'x'.repeat(500) },
      { id: 'one', name: 'Twin' },
      { id: 'lead', name: 'Thief' },
      { id: '../bad', name: 'Path' },
      { id: 'noname', name: '   ' },
      'not a row',
    ],
    connections: [{ id: 'codex', name: 'Sol', look: 'pink', kind: 'made-up' }],
  })
  expect(config?.lead).toEqual({ name: 'Boss', look: 'captain' })
  expect(config?.members.map(m => m.id)).toEqual(['one'])
  expect(config?.members[0]?.job.length).toBe(200)
  expect(config?.connections[0]?.kind).toBe('other')
  expect(normalizeConfig('nonsense')).toBeUndefined()
})

test('characters come from the config, by subagent type, row and name', async () => {
  setCast(CONFIG)
  expect(characterOf('lead')?.name).toBe('القبطان')
  expect(personaFor({ subagentType: 'crew:atlas' })).toBe('atlas')
  expect(personaFor({ persona: 'codex' })).toBe('codex')
  expect(personaFor({ name: 'نوفا: راجع الاختبارات' })).toBe('nova')
  expect(personaFor({ name: 'نوفاوي', model: 'claude-opus-5-5' })).toBeUndefined()
  expect(personaFor({ id: 'x', name: 'Fix it', model: 'claude-sonnet-5-5' })).toBe('atlas')
  setCast(undefined)
  expect(personaFor({ subagentType: 'crew:atlas', model: 'haiku' })).toBeUndefined()
})

test('titled gives the character name alone, and taskOf the rest', async () => {
  setCast(CONFIG)
  const agent = agentOf('nova', 'Account 2 · نوفا: x')
  expect(titled(agent)).toBe('نوفا')
  expect(taskOf(agent)).toBe('x')
  setCast(undefined)
})

test('the crew reaches the agents and the lead by its own names', async () => {
  const prompt = memberPrompt(CONFIG.members[0]!, CONFIG)
  expect(prompt).toContain('نوفا')
  expect(prompt).toContain('القبطان')
  const section = crewSection(CONFIG, '/home/me')
  expect(section).toContain('subagent_type "crew:nova"')
  expect(section).toContain('/home/me/.claude/crew/HANDSHAKE.md')
})

test('the words follow the language', async () => {
  setLanguage('ar')
  expect(t('alone')).toBe('لوحدي')
  expect(t('summary', { running: 2, finished: 1 })).toBe('2 شغّالين · 1 خلّصوا')
  setLanguage('en')
  expect(t('alone')).toBe('On my own')
})

test('the setup page gets its data, and no value can close its script', async () => {
  const evil = normalizeConfig({ lead: { name: '</script><b>' }, members: [] })
  const page = fillPage('<script>const CREW = /*CREW_DATA*/null || {}</script>', 'C:/Users/$& me', evil)
  expect(page).not.toContain('</script><b>')
  expect(page).toContain('C:/Users/$& me')
  for (const look of LOOKS) expect(page).toContain(`"${look}":`)
})

const PANE = {
  component: 'Pane',
  requestId: 'crew',
  props: { title: 'Crew', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } },
} as const

test('the pane offers setup before a crew exists', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const ui = await $.ui.mount({ plugin: 'crew', surface: 'desktop', ...PANE } as never)
  expect(await ui.find({ type: 'Button', key: 'setup' })).toBeDefined()
  await ui.unmount()
})

test('the pane lists a spawned agent, and a message it sends', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a2' }))
  on('session.send', () => ({ isDelivered: true }))
  await $.agent.spawn({ prompt: 'Fix it.', description: 'Fix palette', name: 'fixer' } as never)
  await $.session.send({ to: 'fixer', text: 'Please also check the colour row' } as never)

  const ui = await $.ui.mount({ plugin: 'crew', surface: 'desktop', ...PANE } as never)
  expect(await ui.find({ type: 'Text', text: t('messages') })).toBeDefined()
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.some(s => String(s.props.alt).includes('Please also check'))).toBe(true)
  await ui.unmount()
})

test('the terminal gets a plain line, not a refused tree', async $ => {
  const ui = await $.ui.mount({ plugin: 'crew', surface: 'terminal', ...PANE } as never)
  expect(await ui.find({ type: 'Text' })).toBeDefined()
  await ui.unmount()
})

const BAND = {
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 } },
} as const

test('the band above the prompt names each working agent with its model', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a3' }))
  await $.agent.spawn({ prompt: 'Fix it.', description: 'Fix palette' } as never)

  const ui = await $.ui.mount({ plugin: 'crew', surface: 'desktop', ...BAND } as never)
  const band = await ui.find({ type: 'Svg' })
  expect(String(band?.props.alt)).toContain('Fix palette (Sonnet 5.5)')
  expect(await ui.find({ type: 'Button', key: 'open' })).toBeDefined()
  await ui.unmount()
})

// A repeated attribute (one character's body once had two `rx`) makes the whole SVG invalid
// XML, and the desktop then draws the band's alt text in place of the characters.
test('the band and the cards repeat no attribute in any tag', async () => {
  setCast({ ...CONFIG, members: LOOKS.map(look => ({ id: look, name: look, look, model: 'haiku', effort: 'medium', job: '' })) })
  const crew = LOOKS.map((look, i) => ({
    ...agentOf(look, look), id: look, status: (['running', 'done', 'failed', 'idle'] as const)[i % 4] ?? 'running', isMain: i === 0,
  }))
  const docs = [bandSvg(crew, undefined), ...crew.map(a => cardSvg(a, undefined, 1000))]
  for (const doc of docs) {
    for (const tag of doc.match(/<[a-zA-Z][^>]*>/g) ?? []) {
      const names = [...tag.matchAll(/\s([a-zA-Z:-]+)=/g)].map(m => m[1])
      expect(new Set(names).size).toBe(names.length)
    }
  }
  setCast(undefined)
})
