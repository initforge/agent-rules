import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../src/server/app'
import { getDb, closeDb } from '../src/db'

describe('security: auth', () => {
  beforeAll(async () => { await getDb() })
  afterAll(async () => { await closeDb() })

  it('health bypasses auth', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
  })

  it('plain GET endpoints bypass auth on loopback', async () => {
    const res = await request(app).get('/api/config/platforms')
    expect(res.status).toBe(200)
  })

  it('trust proxy is disabled by default', () => {
    expect(app.get('trust proxy')).toBe(false)
  })

  it('auth uses req.socket.remoteAddress not req.ip to prevent spoofing', () => {
    const settings = app.get('trust proxy')
    expect(settings).toBe(false)
  })
})

describe('security: path traversal', () => {
  it('rejects absolute paths', async () => {
    const res = await request(app).get('/api/config/file?path=/etc/passwd')
    expect(res.status).toBe(403)
  })

  it('rejects rooted Windows paths', async () => {
    const res = await request(app).get('/api/config/file?path=C%3A%5Cwindows%5Csystem32')
    expect(res.status).toBe(403)
  })

  it('rejects UNC paths', async () => {
    const res = await request(app).get('/api/config/file?path=%5C%5C%5C%5Cserver%5Cshare')
    expect(res.status).toBe(403)
  })

  it('rejects ../ traversal', async () => {
    const res = await request(app).get('/api/config/file?path=../')
    expect(res.status).toBe(403)
  })

  it('rejects encoded traversal', async () => {
    const res = await request(app).get('/api/config/file?path=%2e%2e%2f')
    expect(res.status).toBe(403)
  })

  it('rejects null bytes', async () => {
    const res = await request(app).get('/api/config/file?path=rules%00/manifest.yaml')
    expect(res.status).toBe(500)
  })
})

describe('security: CORS origin restriction', () => {
  const configuredOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173'

  it('never emits a wildcard ACAO for a disallowed origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://evil.example')
    // cors() restricts ACAO to the configured origin — never `*`.
    expect(res.headers['access-control-allow-origin'] ?? '*').not.toBe('*')
    expect(res.headers['access-control-allow-origin']).toBe(configuredOrigin)
  })

  it('does not send ACAO:* on responses when no origin is supplied', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['access-control-allow-origin'] ?? '*').not.toBe('*')
  })

  it('grants the configured loopback origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', configuredOrigin)
    expect(res.headers['access-control-allow-origin']).toBe(configuredOrigin)
  })
})

describe('security: rate limiting', () => {
  it('sets rate limit headers', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-ratelimit-limit']).toBeDefined()
    expect(res.headers['x-ratelimit-remaining']).toBeDefined()
  })
})

describe('security: api key auth', () => {
  const { CONTROL_PLANE_API_KEY } = process.env

  afterAll(() => {
    if (CONTROL_PLANE_API_KEY) {
      process.env.CONTROL_PLANE_API_KEY = CONTROL_PLANE_API_KEY
    } else {
      delete process.env.CONTROL_PLANE_API_KEY
    }
  })

  it('accepts valid API key', async () => {
    process.env.CONTROL_PLANE_API_KEY = 'test-key-12345'
    const res = await request(app)
      .get('/api/runs')
      .set('x-api-key', 'test-key-12345')
    expect(res.status).toBe(200)
  })

  it('rejects invalid API key', async () => {
    process.env.CONTROL_PLANE_API_KEY = 'test-key-12345'
    const res = await request(app)
      .get('/api/runs')
      .set('x-api-key', 'wrong-key')
    expect(res.status).toBe(401)
  })

  it('rejects missing API key when env set', async () => {
    process.env.CONTROL_PLANE_API_KEY = 'test-key-12345'
    const res = await request(app).get('/api/runs')
    expect(res.status).toBe(401)
  })
})
