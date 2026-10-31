export type CrewStatus = 'running' | 'done' | 'failed' | 'idle'

export type CrewOutfit =
  | 'crown'
  | 'cap'
  | 'headphones'
  | 'bandana'
  | 'hardhat'
  | 'glasses'
  | 'beret'
  | 'wizard'
  | 'monocle'
  // A Codex agent: Codex's own robot, coloured by its model family.
  | 'robot'

// A character the crew draws in place of the outfit (the same list as LOOKS in hooks/config.ts).
export type CrewLook = 'captain' | 'bow' | 'cat' | 'music' | 'helmet' | 'hologram' | 'pink' | 'scarf'

export type CrewLanguage = 'ar' | 'en'

export type CrewMember = {
  id: string
  name: string
  look: CrewLook
  model: 'haiku' | 'sonnet' | 'opus'
  effort: 'low' | 'medium' | 'high'
  job: string
}

export type CrewConnectionKind = 'claude' | 'codex' | 'gemini' | 'cursor' | 'other'

export type CrewConnection = {
  id: string
  name: string
  look: CrewLook
  kind: CrewConnectionKind
}

// ~/.claude/crew/config.json, as the setup page's prompt writes it.
export type CrewConfig = {
  language: CrewLanguage
  lead: { name: string; look: CrewLook }
  members: CrewMember[]
  connections: CrewConnection[]
}

export type CrewAgent = {
  id: string
  name: string
  address?: string
  kind: string
  model: string
  outfit: CrewOutfit
  // The character's id in config.json: `lead`, a member's or a connected agent's.
  persona?: string
  // The Claude account a row from agents.json belongs to.
  account?: string
  status: CrewStatus
  activity?: string
  startedAt: number
  endedAt?: number
  isMain?: boolean
}

export type CrewMessage = {
  id: string
  from: string
  to: string
  text: string
  at: number
}

export type CrewUsage = {
  contextPercent?: number
  contextTokens?: number
  contextWindow?: number
  limits: { kind: string; percent: number; resetsAt?: string }[]
  usd?: number
}

export type CrewRole = {
  role: 'lead' | 'worker'
  account: string
  name?: string
}

export type CrewPeer = CrewRole & {
  cwd: string
  at: number
}

export type CrewTask = {
  id: string
  from: string
  to: string
  title: string
  brief?: string
  status: 'sent' | 'working' | 'done' | 'failed'
  branch?: string
  result?: string
  sentAt: number
  updatedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    crew: {
      agents: Record<string, CrewAgent>
      order: string[]
      messages: CrewMessage[]
      speaking: Record<string, string>
      usage: CrewUsage
      tasks: CrewTask[]
      peers: Record<string, CrewPeer>
      me: CrewRole
      config: CrewConfig | null
    }
  }
}
