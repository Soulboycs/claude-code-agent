import { ToolRegistry } from '../../main/agent/tools/ToolRegistry'
import { ToolResultPayload } from '../../shared/types'
import { ToolContext } from '../tools/ToolTypes'
import { ToolCallSpec } from './ToolOrchestrator'

type ToolState = 'queued' | 'executing' | 'completed' | 'yielded'

interface TrackedTool {
  spec: ToolCallSpec
  status: ToolState
  isConcurrencySafe: boolean
  promise?: Promise<ToolResultPayload>
  result?: ToolResultPayload
}

export class StreamingToolExecutor {
  private tools: TrackedTool[] = []
  private siblingAbort = new AbortController()

  constructor(
    private registry: ToolRegistry,
    private baseContext: ToolContext,
    private onProgress?: (id: string, chunk: string) => void
  ) {}

  addTool(spec: ToolCallSpec): void {
    const tool = this.registry.getTool(spec.name) as any
    const isConcurrencySafe = Boolean(
      tool?.isConcurrencySafe?.(spec.arguments) ?? tool?.isReadOnly?.(spec.arguments)
    )

    const tracked: TrackedTool = {
      spec,
      status: 'queued',
      isConcurrencySafe,
    }
    this.tools.push(tracked)
    void this.processQueue()
  }

  private canExecute(isConcurrencySafe: boolean): boolean {
    const running = this.tools.filter((t) => t.status === 'executing')
    if (running.length === 0) return true
    return isConcurrencySafe && running.every((t) => t.isConcurrencySafe)
  }

  private async processQueue(): Promise<void> {
    for (const tool of this.tools) {
      if (tool.status !== 'queued') continue

      if (this.canExecute(tool.isConcurrencySafe)) {
        this.execute(tool)
      } else {
        if (!tool.isConcurrencySafe) break
      }
    }
  }

  private execute(tool: TrackedTool): void {
    tool.status = 'executing'

    const childSignal = this.siblingAbort.signal
    const ctx: ToolContext = {
      ...this.baseContext,
      signal: childSignal,
      emitTerminalOutput: (chunk) => this.onProgress?.(tool.spec.id, chunk),
    }

    tool.promise = this.registry
      .executeTool(tool.spec.name, tool.spec.arguments, ctx)
      .then((res) => {
        res.toolCallId = tool.spec.id
        tool.result = res
        tool.status = 'completed'

        // Sibling cascading abort on critical command failure
        if (res.isError && tool.spec.name === 'run_command') {
          this.siblingAbort.abort()
        }
        return res
      })
      .catch((err) => {
        const errorRes: ToolResultPayload = {
          toolCallId: tool.spec.id,
          name: tool.spec.name,
          error: String(err?.message || err),
          isError: true,
        }
        tool.result = errorRes
        tool.status = 'completed'
        return errorRes
      })
      .finally(() => {
        void this.processQueue()
      })
  }

  *getCompleted(): Generator<ToolResultPayload, void> {
    for (const tool of this.tools) {
      if (tool.status === 'completed' && tool.result) {
        tool.status = 'yielded'
        yield tool.result
      }
    }
  }

  async *drainRemaining(): AsyncGenerator<ToolResultPayload, void> {
    while (this.tools.some((t) => t.status !== 'yielded')) {
      await this.processQueue()
      for (const res of this.getCompleted()) {
        yield res
      }

      const running = this.tools
        .filter((t) => t.status === 'executing' && t.promise)
        .map((t) => t.promise!)

      if (running.length > 0) {
        await Promise.race(running)
      }
    }
  }
}
