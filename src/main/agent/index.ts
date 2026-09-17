import { AgentEngine, AgentEngineOptions } from './core/AgentEngine'
import {
  viewFileTool,
  writeToFileTool,
  replaceFileContentTool,
  listDirectoryTool
} from './tools/fileTools'
import { runCommandTool } from './tools/commandTool'
import { globTool, grepTool } from './tools/globGrepTools'

export * from './core/AgentEngine'
export * from './tools/ToolRegistry'
export * from './tools/fileTools'
export * from './tools/commandTool'
export * from './tools/globGrepTools'
export * from './providers/LLMProvider'

export function createDefaultAgentEngine(options: AgentEngineOptions): AgentEngine {
  const engine = new AgentEngine(options)
  const registry = engine.getToolRegistry()

  // Register standard ACI tools
  registry.registerTool(viewFileTool)
  registry.registerTool(writeToFileTool)
  registry.registerTool(replaceFileContentTool)
  registry.registerTool(listDirectoryTool)
  registry.registerTool(runCommandTool)
  registry.registerTool(globTool)
  registry.registerTool(grepTool)

  return engine
}
