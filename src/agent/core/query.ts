import { ToolRegistry } from '../../main/agent/tools/ToolRegistry'
import { ILLMProvider, LLMMessage } from '../../main/agent/providers/LLMProvider'
import { ToolOrchestrator } from './ToolOrchestrator'
import {
  AgentEvent,
  ApprovalRequest,
  ToolCallPayload,
  ToolResultPayload
} from '../../shared/types'

export interface QueryParams {
  messages: LLMMessage[]
  toolRegistry: ToolRegistry
  orchestrator: ToolOrchestrator
  provider: ILLMProvider
  workspaceRoot: string
  maxTurns?: number
  signal?: AbortSignal
  onApprovalRequired?: (request: ApprovalRequest) => Promise<boolean>
  onTerminalOutput?: (chunk: string) => void
}

export type QueryState = {
  messages: LLMMessage[]
  turnCount: number
  transition?: string
}

export type QueryTerminal = {
  reason: 'completed' | 'aborted' | 'max_turns' | 'error'
  messages: LLMMessage[]
  error?: string
}

/**
 * query(): The core Agent iterative state machine (1:1 with Claude Code src/query.ts).
 * Driven by an AsyncGenerator while(true) loop with state = next assignments instead of recursion.
 */
export async function* query(params: QueryParams): AsyncGenerator<AgentEvent, QueryTerminal> {
  const maxTurns = params.maxTurns ?? 25
  const signal = params.signal

  let state: QueryState = {
    messages: [...params.messages],
    turnCount: 1,
    transition: undefined,
  }

  while (true) {
    if (signal?.aborted) {
      return { reason: 'aborted', messages: state.messages }
    }

    const { messages, turnCount } = state

    if (turnCount > maxTurns) {
      yield {
        type: 'error',
        message: `Agent reached maximum safety turn limit (${maxTurns}). Halting.`,
      }
      return { reason: 'max_turns', messages }
    }

    yield {
      type: 'status_change',
      status: 'thinking',
      message: `Turn ${turnCount}/${maxTurns}: Analyzing and generating response...`,
    }

    let streamResult
    try {
      streamResult = await params.provider.chatStream(
        messages,
        params.toolRegistry.getAllTools() as any,
        (chunk) => {
          if (chunk.thinking) {
            // Can be caught by caller if subscribed to events
          }
        },
        signal
      )
    } catch (err: any) {
      if (signal?.aborted) {
        return { reason: 'aborted', messages }
      }
      yield { type: 'error', message: err?.message || String(err) }
      return { reason: 'error', messages, error: err?.message || String(err) }
    }

    if (streamResult.fullThinking) {
      yield { type: 'thinking_delta', delta: streamResult.fullThinking }
    }
    if (streamResult.fullContent) {
      yield { type: 'message_delta', delta: streamResult.fullContent }
    }

    const assistantMsg: LLMMessage = {
      role: 'assistant',
      content: streamResult.fullContent || undefined,
      tool_calls:
        streamResult.toolCalls.length > 0
          ? streamResult.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            }))
          : undefined,
    }

    // If no tools requested, completion exit
    if (streamResult.toolCalls.length === 0) {
      yield { type: 'status_change', status: 'completed', message: 'Task finished successfully.' }
      return { reason: 'completed', messages: [...messages, assistantMsg] }
    }

    // Partition tool calls into concurrent read-only vs serial write batches
    const batches = params.orchestrator.partition(streamResult.toolCalls)
    const toolResultMessages: LLMMessage[] = []

    yield {
      type: 'status_change',
      status: 'tool_executing',
      message: `Executing ${streamResult.toolCalls.length} tool call(s)...`,
    }

    for (const batch of batches) {
      if (signal?.aborted) break

      for (const call of batch.calls) {
        const tool = params.toolRegistry.getTool(call.name)
        const requiresApproval = tool?.requiresApproval ? tool.requiresApproval(call.arguments) : false

        const toolPayload: ToolCallPayload = {
          id: call.id,
          name: call.name,
          arguments: call.arguments,
          requiresApproval,
          description: tool?.description,
        }

        yield { type: 'tool_call_start', toolCall: toolPayload }

        // Human-in-the-Loop check
        if (requiresApproval && params.onApprovalRequired) {
          yield {
            type: 'status_change',
            status: 'awaiting_confirmation',
            message: `Awaiting user confirmation for ${call.name}...`,
          }

          const approvalReq: ApprovalRequest = {
            id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            toolCallId: call.id,
            toolName: call.name,
            arguments: call.arguments,
            promptMessage: `Tool "${call.name}" requires your authorization.`,
            timestamp: Date.now(),
          }

          yield { type: 'approval_required', request: approvalReq }
          const approved = await params.onApprovalRequired(approvalReq)

          if (!approved) {
            const rejectionPayload: ToolResultPayload = {
              toolCallId: call.id,
              name: call.name,
              error: 'Execution cancelled by user.',
              isError: true,
            }
            yield { type: 'tool_call_complete', result: rejectionPayload }
            toolResultMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(rejectionPayload),
            })
            continue
          }
        }
      }

      // Execute this batch
      for await (const update of params.orchestrator.executeBatches([batch], (call) => ({
        workspaceRoot: params.workspaceRoot,
        signal,
        emitTerminalOutput: params.onTerminalOutput,
      }))) {
        if (update.result) {
          yield { type: 'tool_call_complete', result: update.result }
          toolResultMessages.push({
            role: 'tool',
            tool_call_id: update.toolCallId,
            content: update.result.isError
              ? update.result.error || 'Unknown error'
              : update.result.output || 'Success',
          })
        }
      }
    }

    // Atomic State transition for next iteration
    state = {
      messages: [...messages, assistantMsg, ...toolResultMessages],
      turnCount: turnCount + 1,
      transition: 'next_turn',
    }
  }
}
