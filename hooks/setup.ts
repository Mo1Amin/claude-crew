// The setup page: a self-contained HTML file the plugin fills with this person's data
// (home folder, current crew, the drawn characters) and opens in their browser.
import type { EngineInterface } from 'claude-code'

import type { CrewAgent, CrewConfig, CrewLook } from '../types'
import { LOOKS, crewDir } from './config'
import { personaMascot } from './personas'

const PREVIEW: CrewAgent = { id: 'preview', name: '', kind: 'agent', model: '', outfit: 'cap', status: 'running', startedAt: 0 }

export function lookDrawings(): Record<CrewLook, string> {
  return Object.fromEntries(LOOKS.map(look => [look, personaMascot(look, PREVIEW, false)])) as Record<CrewLook, string>
}

/** The page with its data in place. `<` is escaped so no value can close the script tag. */
export function fillPage(page: string, home: string, config: CrewConfig | undefined): string {
  const data = JSON.stringify({ home, crewDir: crewDir(home), config: config ?? null, looks: lookDrawings() }).replace(/</g, '\\u003c')
  return page.replace('/*CREW_DATA*/null', () => data)
}

// Run with no shell, so a path is one argument whatever it holds.
async function openInBrowser($: EngineInterface, path: string): Promise<boolean> {
  const windows = (await $.env.get('OS')) === 'Windows_NT'
  const openers = windows
    ? [['rundll32', 'url.dll,FileProtocolHandler', path.replace(/\//g, '\\')]]
    : [['xdg-open', path], ['open', path]]
  for (const argv of openers) {
    try {
      if ((await $.process.run(argv)).exitCode === 0) return true
    } catch {
      // Not on this system: the next one is tried.
    }
  }
  return false
}

/** Writes the page and the protocol into the crew folder, opens the page, and says where it is. */
export async function openSetup($: EngineInterface, home: string, config: CrewConfig | undefined): Promise<{ path: string; isOpen: boolean }> {
  const dir = crewDir(home)
  const path = `${dir}/setup.html`
  const page = await $.fs.read(`${$.plugin.root}/setup/index.html`)
  await $.fs.write(path, fillPage(page, home, config))
  await $.fs.write(`${dir}/HANDSHAKE.md`, await $.fs.read(`${$.plugin.root}/protocol/HANDSHAKE.md`))
  return { path, isOpen: await openInBrowser($, path) }
}
