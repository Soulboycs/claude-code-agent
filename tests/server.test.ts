import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { startServer } from '../src/server/index'

describe('Bun.serve Server & WebSocket Gateway Tests', () => {
  const TEST_PORT = 3499
  let server: any

  beforeAll(() => {
    server = startServer(TEST_PORT, '127.0.0.1')
  })

  afterAll(() => {
    server?.stop(true)
  })

  it('GET /health returns status ok with runtime bun', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.status).toBe('ok')
    expect(data.runtime).toBe('bun')
  })

  it('POST /api/sessions creates a session record and GET lists it', async () => {
    const postRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TDD Spec Session',
        workDir: 'd:/Agent',
      }),
    })
    expect(postRes.status).toBe(201)
    const newSession = (await postRes.json()) as any
    expect(newSession.id).toBeDefined()
    expect(newSession.title).toBe('TDD Spec Session')

    const getRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/sessions`)
    expect(getRes.status).toBe(200)
    const list = (await getRes.json()) as any[]
    const found = list.find((s) => s.id === newSession.id)
    expect(found).toBeDefined()
  })

  it('connects to /ws/:sessionId and handles ping/pong protocol', async () => {
    const sessionId = 'test_ws_session_1'
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws/${sessionId}`)

    const receivedMessages: any[] = []

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 2000)

      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data))
        receivedMessages.push(msg)

        if (msg.type === 'connected') {
          // Send ping to server
          ws.send(JSON.stringify({ type: 'ping' }))
        } else if (msg.type === 'pong') {
          clearTimeout(timeout)
          ws.close()
          resolve()
        }
      }

      ws.onerror = (err) => {
        clearTimeout(timeout)
        reject(err)
      }
    })

    const types = receivedMessages.map((m) => m.type)
    expect(types).toContain('connected')
    expect(types).toContain('session_state')
    expect(types).toContain('pong')
  })
})
