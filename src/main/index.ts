import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { createDefaultAgentEngine, AgentEngine } from './agent'
import { AgentEvent, ProviderConfig, FileTreeNode } from '../shared/types'

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-gpu-compositing')

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL UNCAUGHT EXCEPTION]', err)
  require('fs').appendFileSync('D:\\Agent\\electron_crash.log', `[UNCAUGHT] ${err.stack || err}\n`)
})
process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL UNHANDLED REJECTION]', reason)
  require('fs').appendFileSync('D:\\Agent\\electron_crash.log', `[REJECTION] ${reason}\n`)
})
let mainWindow: BrowserWindow | null = null
let currentWorkspace: string = process.cwd()
let agentEngine: AgentEngine | null = null

// Default configuration path
const configPath = join(app.getPath('userData'), 'agent-config.json')

async function loadConfig(): Promise<ProviderConfig> {
  try {
    const data = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {
      providerType: 'openai',
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      temperature: 0.2
    }
  }
}

async function saveConfig(config: ProviderConfig): Promise<boolean> {
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    // Update active engine provider
    if (agentEngine) {
      const { createProvider } = await import('./agent/providers/ProviderFactory')
      agentEngine.setProvider(createProvider(config))
    }
    return true
  } catch (err) {
    console.error('Failed to save config:', err)
    return false
  }
}

async function scanDirectory(dirPath: string, maxDepth = 3, currentDepth = 0): Promise<FileTreeNode[]> {
  if (currentDepth > maxDepth) return []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const nodes: FileTreeNode[] = []

    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'out'
      ) {
        continue
      }

      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const children = await scanDirectory(fullPath, maxDepth, currentDepth + 1)
        nodes.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          children
        })
      } else {
        nodes.push({
          name: entry.name,
          path: fullPath,
          isDirectory: false
        })
      }
    }

    return nodes.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name)
      return a.isDirectory ? -1 : 1
    })
  } catch {
    return []
  }
}

function createWindow(): void {
  console.log('[DEBUG] createWindow called')
  mainWindow = new BrowserWindow({
    title: 'NEXUS AGENT',
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    show: true,
    center: true,
    backgroundColor: '#121316',
    webPreferences: {
      preload: existsSync(join(__dirname, '../preload/index.mjs'))
        ? join(__dirname, '../preload/index.mjs')
        : join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.show()
  mainWindow.focus()

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error('[LOAD FAILED]', errorCode, errorDescription, validatedURL)
    existsSync && require('fs').appendFileSync('D:\\Agent\\electron_crash.log', `[LOAD_FAILED] ${errorCode} ${errorDescription} ${validatedURL}\n`)
  })

  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.error('[RENDER PROCESS GONE]', details)
    existsSync && require('fs').appendFileSync('D:\\Agent\\electron_crash.log', `[RENDER_GONE] ${JSON.stringify(details)}\n`)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load HMR URL in development or index.html in production
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function initAgent() {
  const config = await loadConfig()
  agentEngine = createDefaultAgentEngine({
    workspaceRoot: currentWorkspace,
    providerConfig: config
  })

  agentEngine.on('event', (event: AgentEvent) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent:event', event)
    }
  })
}

import { spawn, ChildProcess } from 'child_process'

let serverProcess: ChildProcess | null = null

async function ensureSidecarServer(): Promise<void> {
  try {
    const res = await fetch('http://127.0.0.1:3456/health')
    if (res.ok) {
      console.log('[Sidecar] Bun server already healthy on http://127.0.0.1:3456')
      return
    }
  } catch {}

  const bunPath = process.env.BUN_PATH || 'C:\\Users\\Administrator\\.bun\\bin\\bun.exe'
  const serverScript = join(__dirname, '../../src/server/index.ts')

  try {
    serverProcess = spawn(bunPath, ['run', serverScript], {
      cwd: join(__dirname, '../..'),
      stdio: 'pipe',
      env: { ...process.env, SERVER_PORT: '3456' }
    })
    console.log('[Sidecar] Started local Bun server process')
  } catch (err) {
    console.warn('[Sidecar] Could not spawn local bun sidecar:', err)
  }
}

app.whenReady().then(async () => {
  createWindow()
  await initAgent()
  ensureSidecarServer().catch((e) => console.warn('[Sidecar] error:', e))

  // IPC: Agent Control
  ipcMain.handle('agent:send-message', async (_, prompt: string, workspacePath?: string) => {
    if (!agentEngine) return
    if (workspacePath && workspacePath !== currentWorkspace) {
      currentWorkspace = workspacePath
      agentEngine.setWorkspaceRoot(currentWorkspace)
    }
    agentEngine.run(prompt).catch((err) => {
      console.error('Agent run error:', err)
    })
  })

  ipcMain.handle('agent:abort', async () => {
    agentEngine?.abort()
  })

  ipcMain.handle('agent:respond-approval', async (_, requestId: string, approved: boolean, reason?: string) => {
    agentEngine?.respondApproval(requestId, approved, reason)
  })

  // IPC: Configuration
  ipcMain.handle('agent:get-config', async () => {
    return loadConfig()
  })

  ipcMain.handle('agent:save-config', async (_, config: ProviderConfig) => {
    return saveConfig(config)
  })

  ipcMain.handle('agent:switch-model', async (_, modelId: string) => {
    const config = await loadConfig()
    const { getModelDef } = await import('../shared/models')
    const modelDef = getModelDef(modelId)
    if (!modelDef) return false
    config.model = modelId
    config.providerType = modelDef.provider as any
    await saveConfig(config)
    return true
  })

  // IPC: Workspace Explorer
  ipcMain.handle('workspace:get-current', async () => {
    return currentWorkspace
  })

  ipcMain.handle('workspace:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select Project Workspace Directory'
    })
    if (!result.canceled && result.filePaths.length > 0) {
      currentWorkspace = result.filePaths[0]
      agentEngine?.setWorkspaceRoot(currentWorkspace)
      return currentWorkspace
    }
    return null
  })

  ipcMain.handle('workspace:read-files', async (_, dirPath: string) => {
    return scanDirectory(dirPath || currentWorkspace)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
})
