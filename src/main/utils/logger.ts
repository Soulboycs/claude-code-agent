import * as fs from 'fs'
import * as path from 'path'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export function maskSensitiveData(data: any): any {
  if (typeof data === 'string') {
    return data.replace(/sk-[a-zA-Z0-9_-]{10,}/g, (match) => {
      return match.slice(0, 5) + '***' + match.slice(-4)
    })
  }
  if (data && typeof data === 'object') {
    if (data instanceof Error) {
      return data
    }
    if (Array.isArray(data)) {
      return data.map(item => maskSensitiveData(item))
    }
    const result: Record<string, any> = {}
    for (const [k, v] of Object.entries(data)) {
      if (/key|secret|password|token/i.test(k) && typeof v === 'string') {
        result[k] = v.length > 8 ? v.slice(0, 4) + '***' + v.slice(-4) : '***'
      } else {
        result[k] = maskSensitiveData(v)
      }
    }
    return result
  }
  return data
}

class Logger {
  private logDir: string
  private logFilePath: string

  constructor() {
    this.logDir = path.resolve(process.cwd(), 'logs')
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }
    } catch {
      this.logDir = process.cwd()
    }
    this.logFilePath = path.join(this.logDir, 'nexus-agent.log')
  }

  public getLogFilePath(): string {
    return this.logFilePath
  }

  private writeLog(level: LogLevel, moduleName: string, message: string, meta?: any): void {
    const timestamp = new Date().toISOString()
    let metaStr = ''
    if (meta !== undefined) {
      try {
        const masked = maskSensitiveData(meta)
        if (masked instanceof Error) {
          metaStr = '\n' + (masked.stack || masked.message)
        } else if (typeof masked === 'object') {
          metaStr = '\n' + JSON.stringify(masked, null, 2)
        } else {
          metaStr = ' ' + String(masked)
        }
      } catch {
        metaStr = ' [Serialization Error]'
      }
    }

    const logLine = '[' + timestamp + '] [' + level + '] [' + moduleName + '] ' + message + metaStr + '\n'

    if (level === 'ERROR') {
      console.error(logLine.trimEnd())
    } else if (level === 'WARN') {
      console.warn(logLine.trimEnd())
    } else {
      console.log(logLine.trimEnd())
    }

    try {
      fs.appendFileSync(this.logFilePath, logLine, 'utf-8')
    } catch (err) {
      console.error('Failed to write to log file:', err)
    }
  }

  public debug(module: string, message: string, meta?: any): void {
    this.writeLog('DEBUG', module, message, meta)
  }

  public info(module: string, message: string, meta?: any): void {
    this.writeLog('INFO', module, message, meta)
  }

  public warn(module: string, message: string, meta?: any): void {
    this.writeLog('WARN', module, message, meta)
  }

  public error(module: string, message: string, errorOrMeta?: any): void {
    this.writeLog('ERROR', module, message, errorOrMeta)
  }
}

export const logger = new Logger()
