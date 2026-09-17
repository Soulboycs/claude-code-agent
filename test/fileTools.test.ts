import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  viewFileTool,
  writeToFileTool,
  replaceFileContentTool,
  listDirectoryTool
} from '../src/main/agent/tools/fileTools'

describe('ACI File Tools - Evidence-Driven Tests', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('write_to_file', () => {
    it('creates new files and directories if they do not exist', async () => {
      const filePath = 'nested/folder/hello.txt'
      const content = 'Hello, Agentic World!'

      const result = await writeToFileTool.execute(
        { filePath, content, overwrite: true },
        { workspaceRoot: tempDir }
      )

      expect(result).toContain('Successfully wrote')
      const saved = await fs.readFile(path.join(tempDir, filePath), 'utf-8')
      expect(saved).toBe(content)
    })

    it('prevents accidental overwrite when overwrite is false', async () => {
      const filePath = 'protected.txt'
      await fs.writeFile(path.join(tempDir, filePath), 'original content')

      await expect(
        writeToFileTool.execute(
          { filePath, content: 'new content', overwrite: false },
          { workspaceRoot: tempDir }
        )
      ).rejects.toThrow(/already exists and overwrite is set to false/)
    })
  })

  describe('view_file', () => {
    it('slices lines accurately with 1-based indexing and line numbers', async () => {
      const filePath = 'multiline.txt'
      const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5']
      await fs.writeFile(path.join(tempDir, filePath), lines.join('\n'))

      const result = await viewFileTool.execute(
        { filePath, startLine: 2, endLine: 4 },
        { workspaceRoot: tempDir }
      )

      expect(result).toContain('Lines 2-4 of 5')
      expect(result).toContain('   2: Line 2')
      expect(result).toContain('   3: Line 3')
      expect(result).toContain('   4: Line 4')
      expect(result).not.toContain('   1: Line 1')
      expect(result).not.toContain('   5: Line 5')
    })
  })

  describe('replace_file_content', () => {
    it('replaces exact target content safely', async () => {
      const filePath = 'code.ts'
      const initial = `function add(a: number, b: number) {\n  return a - b // bug\n}\n`
      await fs.writeFile(path.join(tempDir, filePath), initial)

      const result = await replaceFileContentTool.execute(
        {
          filePath,
          targetContent: '  return a - b // bug',
          replacementContent: '  return a + b // fixed',
          allowMultiple: false
        },
        { workspaceRoot: tempDir }
      )

      expect(result).toContain('Successfully replaced 1 occurrence(s)')
      const updated = await fs.readFile(path.join(tempDir, filePath), 'utf-8')
      expect(updated).toContain('  return a + b // fixed')
      expect(updated).not.toContain('return a - b')
    })

    it('rejects ambiguous replacement if targetContent matches multiple times without allowMultiple', async () => {
      const filePath = 'duplicate.txt'
      const initial = `foo\nfoo\nbar`
      await fs.writeFile(path.join(tempDir, filePath), initial)

      await expect(
        replaceFileContentTool.execute(
          {
            filePath,
            targetContent: 'foo',
            replacementContent: 'baz',
            allowMultiple: false
          },
          { workspaceRoot: tempDir }
        )
      ).rejects.toThrow(/matches 2 locations/)
    })

    it('throws meaningful error if targetContent does not exist', async () => {
      const filePath = 'test.txt'
      await fs.writeFile(path.join(tempDir, filePath), 'hello world')

      await expect(
        replaceFileContentTool.execute(
          {
            filePath,
            targetContent: 'nonexistent',
            replacementContent: 'replacement',
            allowMultiple: false
          },
          { workspaceRoot: tempDir }
        )
      ).rejects.toThrow(/targetContent not found/)
    })
  })

  describe('list_directory', () => {
    it('accurately lists files and directories', async () => {
      await fs.mkdir(path.join(tempDir, 'subfolder'))
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'content')

      const result = await listDirectoryTool.execute(
        { dirPath: '.' },
        { workspaceRoot: tempDir }
      )

      expect(result).toContain('📁 [DIR]  subfolder/')
      expect(result).toContain('📄 [FILE] file.txt')
    })
  })
})
