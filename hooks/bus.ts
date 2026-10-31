// The crew bus: Claude sessions, on one account or several, hand each other work.
// Everything lives in ~/.claude/crew/bus as plain JSON both sessions' models read and write:
//   peers.json  each session's heartbeat: its account, its role (lead / worker), its name
//   tasks.json  the tasks one sent the other, with their state
// and board.html, a page the person opens in a browser, rebuilt from both.
// Swapping places is one command on each side: /crew-role lead 2 or /crew-role worker 1.
// Agents of other makers join the same files: see protocol/HANDSHAKE.md.
import type { EngineInterface } from 'claude-code'

import type { CrewPeer, CrewRole, CrewTask } from '../types'
import { esc } from './art'
import { crewDir } from './config'
import { isRtl, lang, t } from './strings'

export const ONLINE_MS = 15000

export function busDir(home: string): string {
  return `${crewDir(home)}/bus`
}

async function readJson<T>($: EngineInterface, path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return fallback
  }
}

export async function readTasks($: EngineInterface, home: string): Promise<CrewTask[]> {
  const rows = await readJson<CrewTask[]>($, `${busDir(home)}/tasks.json`, [])
  return Array.isArray(rows) ? rows.filter(t => t && typeof t.id === 'string') : []
}

export async function readPeers($: EngineInterface, home: string): Promise<Record<string, CrewPeer>> {
  const map = await readJson<Record<string, CrewPeer>>($, `${busDir(home)}/peers.json`, {})
  return map && typeof map === 'object' ? map : {}
}

/** This session says it is alive, under its account; the other entries stay as they are. */
export async function heartbeat($: EngineInterface, home: string, me: CrewRole, cwd: string): Promise<void> {
  const peers = await readPeers($, home)
  peers[me.account] = { ...me, cwd, at: await $.clock.now() }
  await $.fs.write(`${busDir(home)}/peers.json`, JSON.stringify(peers, null, 2))
}

export function parseRole(args: string, prev: CrewRole): CrewRole | string {
  const [role, account, ...name] = args.trim().split(/\s+/).filter(Boolean)
  if (role !== 'lead' && role !== 'worker') return t('roleUsage')
  return { role, account: account || prev.account, name: name.join(' ') || prev.name }
}

const stateWord = (status: CrewTask['status']): string => (['sent', 'working', 'done', 'failed'].includes(status) ? t(status) : status)

export function taskLine(task: CrewTask): string {
  return `${stateWord(task.status)} · ${task.title} (${t('account')} ${task.from} ← ${t('account')} ${task.to})`
}

type BoardAgent = { name: string; model: string; status: string; activity?: string; account?: string }

export function boardHtml(peers: Record<string, CrewPeer>, tasks: CrewTask[], agents: BoardAgent[], now: number): string {
  const peerRows = Object.values(peers)
    .sort((a, b) => a.account.localeCompare(b.account))
    .map(p => {
      const on = now - p.at < ONLINE_MS
      return `<li><b>${esc(t('account'))} ${esc(p.account)}</b> · ${esc(t(p.role))}${p.name ? ' · ' + esc(p.name) : ''} <span class="${on ? 'on' : 'off'}">${esc(t(on ? 'online' : 'offline'))}</span></li>`
    })
    .join('')
  const taskRows = tasks
    .slice(-20)
    .reverse()
    .map(task => `<tr><td>${esc(stateWord(task.status))}</td><td>${esc(task.title)}</td><td>${esc(task.from)} ← ${esc(task.to)}</td><td>${esc(task.branch ?? '')}</td><td>${esc(task.result ?? '')}</td></tr>`)
    .join('')
  const agentRows = agents
    .map(a => `<tr><td>${esc(a.status)}</td><td>${esc(a.name)}</td><td>${esc(a.model)}</td><td>${esc(a.activity ?? '')}</td></tr>`)
    .join('')
  return `<!doctype html>
<html lang="${lang()}" dir="${isRtl() ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>${esc(t('boardTitle'))}</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--ink:#1d1d1f;--muted:#6e6e73;--line:#e5e5e7;--on:#1f8a5b;--off:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161617;--card:#1f1f21;--ink:#f2f2f2;--muted:#9a9aa0;--line:#2e2e31;--on:#4cc38a;--off:#ff8a80}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Segoe UI",Tahoma,sans-serif;padding:16px}
main{max-width:960px;margin:auto;display:grid;gap:16px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;overflow-x:auto}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:0 0 8px;color:var(--muted)}
ul{margin:0;padding:0;list-style:none;display:grid;gap:6px}
table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-top:1px solid var(--line);vertical-align:top}
.on{color:var(--on)}.off{color:var(--off)}.empty{color:var(--muted)}
</style></head><body><main>
<h1>${esc(t('boardTitle'))}</h1>
<section><h2>${esc(t('boardSessions'))}</h2><ul>${peerRows || `<li class="empty">${esc(t('boardNoSession'))}</li>`}</ul></section>
<section><h2>${esc(t('boardTasks'))}</h2><table>${taskRows || `<tr><td class="empty">${esc(t('boardNoTasks'))}</td></tr>`}</table></section>
<section><h2>${esc(t('boardAgents'))}</h2><table>${agentRows || `<tr><td class="empty">${esc(t('boardNoAgents'))}</td></tr>`}</table></section>
</main></body></html>
`
}
