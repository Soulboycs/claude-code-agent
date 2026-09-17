// Types and contracts shared across Main, Preload, and Renderer

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'tool_executing'
  | 'awaiting_confirmation'
  | 'error'
  | 'completed'

export interface ToolCallPayload {
  id: string
  name: string
  arguments: Record<string, unknown>
  requiresApproval?: boolean
  description?: string
}

export interface ToolResultPayload {
  toolCallId: string
  name: string
  output?: string
  error?: string
  isError: boolean
}

export interface ApprovalRequest {
  id: string
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
  promptMessage: string
  timestamp: number
}

export type AgentEvent =
  | { type: 'status_change'; status: AgentStatus; message?: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'message_delta'; delta: string }
  | { type: 'tool_call_start'; toolCall: ToolCallPayload }
  | { type: 'tool_call_output'; toolCallId: string; chunk: string }
  | { type: 'tool_call_complete'; result: ToolResultPayload }
  | { type: 'approval_required'; request: ApprovalRequest }
  | { type: 'token_usage'; promptTokens: number; completionTokens: number; totalTokens: number }
  | { type: 'terminal_output'; chunk: string }
  | { type: 'error'; message: string; details?: string }

export type MessageBlock =
  | { type: 'text'; id: string; content: string }
  | { type: 'thinking'; id: string; content: string }
  | {
      type: 'tool'
      id: string
      toolCall: ToolCallPayload
      result?: ToolResultPayload
      status: 'running' | 'completed' | 'error'
    }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  toolCalls?: ToolCallPayload[]
  toolResults?: ToolResultPayload[]
  blocks?: MessageBlock[]
  timestamp: number
  isStreaming?: boolean
}

export interface ProviderConfig {
  providerType: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'ollama' | 'openai-compatible'
  // OpenAI/DeepSeek/OpenAI-compatible
  apiKey?: string
  baseURL?: string
  model: string
  temperature?: number
  // 各厂商独立 key（Settings 里分开存）
  anthropicApiKey?: string
  geminiApiKey?: string
  ollamaBaseURL?: string  // default: http://localhost:11434
}

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
}

export interface IElectronAPI {
  // Agent Control
  sendMessage: (prompt: string, workspacePath?: string) => Promise<void>
  abortAgent: () => Promise<void>
  abort?: () => Promise<void>
  respondApproval: (requestId: string, approved: boolean, reason?: string) => Promise<void>
  switchModel: (modelId: string) => Promise<void>

  // Configuration
  getProviderConfig: () => Promise<ProviderConfig>
  saveProviderConfig: (config: ProviderConfig) => Promise<boolean>

  // Workspace
  getCurrentWorkspace: () => Promise<string>
  selectWorkspaceFolder: () => Promise<string | null>
  readWorkspaceFiles: (dirPath: string) => Promise<FileTreeNode[]>

  // Event Listeners
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void
  onTerminalData: (callback: (data: string) => void) => () => void
  sendTerminalInput: (data: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}
