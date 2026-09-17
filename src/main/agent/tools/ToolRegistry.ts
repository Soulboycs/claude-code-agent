import { z } from 'zod'
import { ToolResultPayload } from '@shared/types'

export interface ToolContext {
  workspaceRoot: string
  emitTerminalOutput?: (chunk: string) => void
  signal?: AbortSignal
}

export interface AgentTool<TArgs = any> {
  name: string
  description: string
  parameters: z.ZodType<TArgs>
  requiresApproval?: (args: TArgs) => boolean
  execute: (args: TArgs, context: ToolContext) => Promise<string>
}

export class ToolRegistry {
  private tools = new Map<string, AgentTool>()

  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool)
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name)
  }

  getAllTools(): AgentTool[] {
    return Array.from(this.tools.values())
  }

  getToolDefinitions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.getAllTools().map((t) => {
      // Basic JSON Schema representation from zod or custom
      return {
        name: t.name,
        description: t.description,
        parameters: { type: 'object' } // Providers can serialize schema accordingly
      }
    })
  }

  async executeTool(
    name: string,
    rawArgs: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResultPayload> {
    const tool = this.tools.get(name)
    if (!tool) {
      return {
        toolCallId: '',
        name,
        error: `Tool "${name}" is not registered. Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
        isError: true
      }
    }

    try {
      const parsedArgs = tool.parameters.parse(rawArgs)
      const output = await tool.execute(parsedArgs, context)
      return {
        toolCallId: '',
        name,
        output,
        isError: false
      }
    } catch (err: any) {
      const errorMsg = err instanceof z.ZodError
        ? `Invalid tool arguments for ${name}: ${JSON.stringify(err.format())}`
        : err?.message || String(err)
      return {
        toolCallId: '',
        name,
        error: errorMsg,
        isError: true
      }
    }
  }
}
