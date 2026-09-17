import { z } from 'zod'
import { ToolResultPayload } from '../../shared/types'

export interface ToolContext {
  workspaceRoot: string
  emitTerminalOutput?: (chunk: string) => void
  signal?: AbortSignal
  sessionId?: string
}

export interface AgentTool<TArgs = any> {
  name: string
  description: string
  parameters: z.ZodType<TArgs>
  requiresApproval?: (args: TArgs) => boolean

  /** Concurrency and mutation classification (1:1 with Claude Code Tool contract) */
  isReadOnly?: (args: TArgs) => boolean
  isConcurrencySafe?: (args: TArgs) => boolean
  isDestructive?: (args: TArgs) => boolean

  execute: (args: TArgs, context: ToolContext) => Promise<string>
}

export function buildAgentTool<TArgs>(tool: AgentTool<TArgs>): AgentTool<TArgs> {
  return {
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    isDestructive: () => false,
    ...tool,
  }
}
