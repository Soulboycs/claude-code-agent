import { z } from 'zod'
import { AgentTool } from './ToolRegistry'
import { glob } from 'node:fs/promises'
import fs from 'node:fs/promises'
import path from 'node:path'

function resolvePath(filePath: string, workspaceRoot: string): string {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath)
  }
  return path.normalize(path.join(workspaceRoot, filePath))
}

export const globTool: AgentTool = {
  name: 'GlobTool',
  description: 'Search for files by name pattern or wildcard.',
  parameters: z.object({
    pattern: z.string().describe('The glob pattern to match files against'),
    path: z.string().optional().describe('The directory to search in. Defaults to workspace root.')
  }),
  execute: async ({ pattern, path: searchPath }, context) => {
    const rootPath = searchPath ? resolvePath(searchPath, context.workspaceRoot) : context.workspaceRoot
    try {
      const results: string[] = []
      let count = 0
      for await (const p of glob(pattern, { cwd: rootPath, withFileTypes: false, exclude: (d) => d.name === 'node_modules' || d.name === '.git' })) {
        results.push(p.toString())
        count++
        if (count > 200) {
          results.push('... (truncated)')
          break
        }
      }
      if (results.length === 0) return 'No files found'
      return results.join('\n')
    } catch (err: any) {
      throw new Error(`GlobTool failed: ${err.message}`)
    }
  }
}

export const grepTool: AgentTool = {
  name: 'GrepTool',
  description: 'Search file contents with regex. Returns matching lines and line numbers.',
  parameters: z.object({
    pattern: z.string().describe('The regular expression pattern to search for'),
    path: z.string().optional().describe('Directory to search in. Defaults to workspace root.'),
    globPattern: z.string().optional().describe('Glob pattern to filter files (e.g. "*.ts")')
  }),
  execute: async ({ pattern, path: searchPath, globPattern }, context) => {
    const rootPath = searchPath ? resolvePath(searchPath, context.workspaceRoot) : context.workspaceRoot
    const regex = new RegExp(pattern, 'g')
    const searchGlob = globPattern || '**/*'
    try {
      const results: string[] = []
      let matchCount = 0
      
      for await (const p of glob(searchGlob, { cwd: rootPath, withFileTypes: true, exclude: (d) => d.name === 'node_modules' || d.name === '.git' })) {
        if (!p.isFile()) continue
        // node:fs/promises glob withFileTypes gives Dirent. p.parentPath might be available in Node 21+, else fallback to p.path
        const parent = (p as any).parentPath || (p as any).path || ''
        const fullPath = path.join(parent, p.name)
        if (!fullPath.startsWith(rootPath)) continue // sanity check
        
        const relPath = path.relative(rootPath, fullPath)
        
        try {
          const content = await fs.readFile(fullPath, 'utf-8')
          // very basic binary check
          if (content.indexOf('\0') !== -1) continue

          const lines = content.split(/\r?\n/)
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${relPath}:${i + 1}:${lines[i]}`)
              matchCount++
              if (matchCount > 300) {
                results.push('... (truncated)')
                return results.join('\n')
              }
            }
          }
        } catch (e) {
          // ignore read errors
        }
      }
      
      if (results.length === 0) return 'No matches found'
      return results.join('\n')
    } catch (err: any) {
      throw new Error(`GrepTool failed: ${err.message}`)
    }
  }
}
