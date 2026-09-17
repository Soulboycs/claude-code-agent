/**
 * High-Value Automated Test Suite for MarkdownRenderer Engine
 *
 * Verifies:
 * 1. GFM Structure & Token Parsing (Headings, lists, tables, blockquotes, formatting)
 * 2. Independent Code Block Extraction & Language Tagging
 * 3. Streaming Virtual Fence Auto-Closure (Prevents layout destruction during streaming)
 * 4. Adversarial XSS Sanitization & Injection Immunity
 * 5. Degenerate & Edge Case Stability
 */
import { describe, it, expect } from 'bun:test'
import {
  closeUnclosedFences,
  parseMarkdownToNodes,
  purifier
} from '../src/renderer/src/components/MarkdownRenderer'

describe('MarkdownRenderer Engine: 1. GFM 结构与排版解析 (GFM Structure Parsing)', () => {
  it('parses headings H1 through H4 with proper semantic tags', () => {
    const md = '# Header 1\n## Header 2\n### Header 3\n#### Header 4'
    const nodes = parseMarkdownToNodes(md)
    expect(nodes.length).toBe(1)
    expect(nodes[0].type).toBe('html')
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).toContain('<h1>Header 1</h1>')
      expect(nodes[0].content).toContain('<h2>Header 2</h2>')
      expect(nodes[0].content).toContain('<h3>Header 3</h3>')
      expect(nodes[0].content).toContain('<h4>Header 4</h4>')
    }
  })

  it('parses bold, italic, strikethrough, and inline code spans', () => {
    const md = 'Text with **bold**, *italic*, ~~strikethrough~~, and `inline_code()`.'
    const nodes = parseMarkdownToNodes(md)
    expect(nodes.length).toBe(1)
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).toContain('<strong>bold</strong>')
      expect(nodes[0].content).toContain('<em>italic</em>')
      expect(nodes[0].content).toContain('<del>strikethrough</del>')
      expect(nodes[0].content).toContain('<code>inline_code()</code>')
    }
  })

  it('parses GFM blockquotes with nested styling', () => {
    const md = '> This is a critical blockquote notice.'
    const nodes = parseMarkdownToNodes(md)
    expect(nodes.length).toBe(1)
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).toContain('<blockquote>')
      expect(nodes[0].content).toContain('This is a critical blockquote notice.')
    }
  })

  it('parses ordered and unordered lists', () => {
    const md = '- Item Alpha\n- Item Beta\n\n1. Step One\n2. Step Two'
    const nodes = parseMarkdownToNodes(md)
    expect(nodes.length).toBe(1)
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).toContain('<ul>')
      expect(nodes[0].content).toContain('<li>Item Alpha</li>')
      expect(nodes[0].content).toContain('<ol>')
      expect(nodes[0].content).toContain('<li>Step One</li>')
    }
  })

  it('parses GFM tables with header, rows, and cell alignment', () => {
    const md = `| Parameter | Type | Required | Description |
| :--- | :---: | :---: | --- |
| target | string | Yes | Target file path |
| line | number | No | Optional line |`

    const nodes = parseMarkdownToNodes(md)
    expect(nodes.length).toBe(1)
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).toContain('<table>')
      expect(nodes[0].content).toContain('<thead>')
      expect(nodes[0].content).toContain('Parameter</th>')
      expect(nodes[0].content).toContain('<th>Description</th>')
      expect(nodes[0].content).toContain('<tbody>')
      expect(nodes[0].content).toContain('target</td>')
      expect(nodes[0].content).toContain('<td>Target file path</td>')
    }
  })
})

describe('MarkdownRenderer Engine: 2. 独立代码块提取与语法结构 (Code Block Separation)', () => {
  it('extracts fenced code blocks into separate code nodes with language and preserves formatting', () => {
    const md = `Here is the implementation:

\`\`\`typescript
interface Config {
  apiKey: string;
  maxRetries: number;
}
export const DEFAULT_CONFIG: Config = {
  apiKey: "secret",
  maxRetries: 3,
};
\`\`\`

And that concludes the setup.`

    const nodes = parseMarkdownToNodes(md)
    expect(nodes.length).toBe(3)

    // Node 0: Leading text
    expect(nodes[0].type).toBe('html')
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).toContain('Here is the implementation:')
    }

    // Node 1: Code block
    expect(nodes[1].type).toBe('code')
    if (nodes[1].type === 'code') {
      expect(nodes[1].language).toBe('typescript')
      expect(nodes[1].code).toContain('interface Config')
      expect(nodes[1].code).toContain('apiKey: "secret"')
      expect(nodes[1].code).toContain('maxRetries: 3')
    }

    // Node 2: Trailing text
    expect(nodes[2].type).toBe('html')
    if (nodes[2].type === 'html') {
      expect(nodes[2].content).toContain('And that concludes the setup.')
    }
  })

  it('handles multiple consecutive and mixed code blocks', () => {
    const md = `\`\`\`bash
npm run build
\`\`\`
\`\`\`python
print("hello world")
\`\`\``

    const nodes = parseMarkdownToNodes(md)
    expect(nodes.length).toBe(2)
    expect(nodes[0].type).toBe('code')
    if (nodes[0].type === 'code') {
      expect(nodes[0].language).toBe('bash')
      expect(nodes[0].code.trim()).toBe('npm run build')
    }
    expect(nodes[1].type).toBe('code')
    if (nodes[1].type === 'code') {
      expect(nodes[1].language).toBe('python')
      expect(nodes[1].code.trim()).toBe('print("hello world")')
    }
  })
})

describe('MarkdownRenderer Engine: 3. 流式未闭合反引号虚拟补全 (Virtual Fence Auto-Closure)', () => {
  it('detects unclosed code fence during streaming and auto-appends closing backticks', () => {
    const streamingChunk = `Here is code in progress:

\`\`\`json
{
  "status": "pending",
  "data": [1, 2, 3`

    // Without streaming, raw text has unclosed fence
    const closedText = closeUnclosedFences(streamingChunk)
    expect(closedText).toContain('```json\n{\n  "status": "pending",\n  "data": [1, 2, 3\n```')

    // parseMarkdownToNodes with isStreaming=true should successfully isolate code node
    const nodes = parseMarkdownToNodes(streamingChunk, true)
    expect(nodes.length).toBe(2)
    expect(nodes[0].type).toBe('html')
    expect(nodes[1].type).toBe('code')
    if (nodes[1].type === 'code') {
      expect(nodes[1].language).toBe('json')
      expect(nodes[1].code).toContain('"status": "pending"')
    }
  })

  it('does NOT append backticks when fences are fully closed', () => {
    const complete = `\`\`\`js\nconst x = 10;\n\`\`\``
    expect(closeUnclosedFences(complete)).toBe(complete)
  })

  it('does NOT mistake inline backticks for code block fences', () => {
    const textWithInline = `Use \`git commit -m "fix"\` and \`git push\` to publish.`
    expect(closeUnclosedFences(textWithInline)).toBe(textWithInline)

    const nodes = parseMarkdownToNodes(textWithInline, true)
    expect(nodes.length).toBe(1)
    expect(nodes[0].type).toBe('html')
  })
})

describe('MarkdownRenderer Engine: 4. 对抗性 XSS 注入防护 (Adversarial Security Sanitization)', () => {
  it('strips malicious <script> tags completely', () => {
    const malicious = `Normal text <script>alert('pwned')</script> end text`
    const nodes = parseMarkdownToNodes(malicious)
    expect(nodes.length).toBe(1)
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).not.toContain('<script>')
      expect(nodes[0].content).not.toContain('alert(')
      expect(nodes[0].content).toContain('Normal text')
      expect(nodes[0].content).toContain('end text')
    }
  })

  it('strips dangerous event handlers like onerror, onload, onclick from embedded elements', () => {
    const malicious = `Image preview: <img src="valid.png" onerror="alert(document.cookie)" />`
    const nodes = parseMarkdownToNodes(malicious)
    expect(nodes.length).toBe(1)
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).not.toContain('onerror')
      expect(nodes[0].content).not.toContain('document.cookie')
      expect(nodes[0].content).toContain('<img')
    }
  })

  it('neutralizes malicious javascript: URI schemes in anchors', () => {
    const malicious = `[Click here for prize](javascript:stealTokens())`
    const nodes = parseMarkdownToNodes(malicious)
    expect(nodes.length).toBe(1)
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).not.toContain('href="javascript:')
      expect(nodes[0].content).not.toContain('stealTokens()')
    }
  })

  it('disallows iframe / embed / object tags completely', () => {
    // Pure iframe is completely removed to empty
    expect(parseMarkdownToNodes('<iframe src="https://attacker.evil/payload"></iframe>')).toEqual([])

    // Mixed iframe has iframe cleanly stripped while preserving legitimate text
    const mixed = `Safe content before <iframe src="https://attacker.evil/payload"></iframe> and after`
    const nodes = parseMarkdownToNodes(mixed)
    expect(nodes.length).toBe(1)
    if (nodes[0].type === 'html') {
      expect(nodes[0].content).not.toContain('<iframe')
      expect(nodes[0].content).not.toContain('attacker.evil')
      expect(nodes[0].content).toContain('Safe content before')
      expect(nodes[0].content).toContain('and after')
    }
  })
})

describe('MarkdownRenderer Engine: 5. 极端边界与退化输入稳定性 (Edge & Degenerate Cases)', () => {
  it('handles empty string and whitespace gracefully', () => {
    expect(parseMarkdownToNodes('')).toEqual([])
    expect(parseMarkdownToNodes('   \n\n  ')).toEqual([])
  })

  it('handles code block without language specifier', () => {
    const md = `\`\`\`\nplain text content\n\`\`\``
    const nodes = parseMarkdownToNodes(md)
    expect(nodes.length).toBe(1)
    expect(nodes[0].type).toBe('code')
    if (nodes[0].type === 'code') {
      expect(nodes[0].language).toBeFalsy()
      expect(nodes[0].code.trim()).toBe('plain text content')
    }
  })


  it('handles large multi-kilobyte complex markdown without degradation', () => {
    const parts = [
      '# Comprehensive Test Report\n\n',
      'This document contains extensive notes and logs.\n\n',
      '| ID | Status | Message |\n|---|---|---|\n'
    ]
    for (let i = 0; i < 50; i++) {
      parts.push(`| ${i} | PASS | Checked iteration step ${i} |\n`)
    }
    parts.push('\n```python\nfor i in range(50):\n    print(f"Index: {i}")\n```\n')

    const longDoc = parts.join('')
    const start = performance.now()
    const nodes = parseMarkdownToNodes(longDoc)
    const duration = performance.now() - start

    expect(nodes.length).toBe(2)
    expect(nodes[0].type).toBe('html')
    expect(nodes[1].type).toBe('code')
    expect(duration).toBeLessThan(150) // Fast parsing under 150ms
  })
})
