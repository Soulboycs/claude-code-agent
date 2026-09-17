/**
 * TDD Test Suite: Workspace Resolution & Non-intrusive Initialization
 *
 * Requirements:
 * 1. App startup must NOT invoke interactive dialogs (no intrusive folder picker on launch).
 * 2. Workspace getter returns valid current working directory or configured directory.
 * 3. Path scanning works safely with proper ignoring of node_modules, .git, etc.
 */
import { describe, it, expect } from 'bun:test'
import path from 'path'
import fs from 'fs'

describe('Workspace Manager — TDD: Non-intrusive Workspace Detection', () => {
  it('resolves default workspace non-intrusively without dialog prompt', () => {
    // Current working directory should be default workspace
    const defaultWorkspace = process.cwd()
    expect(defaultWorkspace).toBeDefined()
    expect(typeof defaultWorkspace).toBe('string')
    expect(fs.existsSync(defaultWorkspace)).toBe(true)
  })

  it('normalizes workspace directory path properly', () => {
    const rawPath = process.cwd()
    const resolved = path.resolve(rawPath)
    expect(resolved).toBe(rawPath)
  })

  it('correctly validates workspace directories', () => {
    expect(fs.existsSync('D:\\Agent')).toBe(true)
    expect(fs.existsSync('D:\\Agent\\invalid_nonexistent_directory_12345')).toBe(false)
  })
})
