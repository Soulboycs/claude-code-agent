import { contextBridge, ipcRenderer } from 'electron'
import { AgentEvent, ProviderConfig, IElectronAPI } from '../shared/types'

const api: IElectronAPI = {
  sendMessage: (prompt: string, workspacePath?: string) => {
    return ipcRenderer.invoke('agent:send-message', prompt, workspacePath)
  },
  abortAgent: () => {
    return ipcRenderer.invoke('agent:abort')
  },
  abort: () => {
    return ipcRenderer.invoke('agent:abort')
  },
  respondApproval: (requestId: string, approved: boolean, reason?: string) => {
    return ipcRenderer.invoke('agent:respond-approval', requestId, approved, reason)
  },
  switchModel: (modelId: string) => {
    return ipcRenderer.invoke('agent:switch-model', modelId)
  },
  getProviderConfig: () => {
    return ipcRenderer.invoke('agent:get-config')
  },
  saveProviderConfig: (config: ProviderConfig) => {
    return ipcRenderer.invoke('agent:save-config', config)
  },
  getCurrentWorkspace: () => {
    return ipcRenderer.invoke('workspace:get-current')
  },
  selectWorkspaceFolder: () => {
    return ipcRenderer.invoke('workspace:select-folder')
  },
  readWorkspaceFiles: (dirPath: string) => {
    return ipcRenderer.invoke('workspace:read-files', dirPath)
  },
  onAgentEvent: (callback: (event: AgentEvent) => void) => {
    const handler = (_: any, event: AgentEvent) => callback(event)
    ipcRenderer.on('agent:event', handler)
    return () => {
      ipcRenderer.removeListener('agent:event', handler)
    }
  },
  onTerminalData: (callback: (data: string) => void) => {
    const handler = (_: any, data: string) => callback(data)
    ipcRenderer.on('terminal:data', handler)
    return () => {
      ipcRenderer.removeListener('terminal:data', handler)
    }
  },
  sendTerminalInput: (data: string) => {
    return ipcRenderer.invoke('terminal:input', data)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error('Failed to expose electronAPI in contextIsolated mode:', error)
  }
} else {
  // @ts-ignore (fallback when not context isolated)
  window.electronAPI = api
}
