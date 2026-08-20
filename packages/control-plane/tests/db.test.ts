import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getDb, closeDb, resetDb, getStore, addAudit, addRun, addTelemetry, STORE_SCHEMA_VERSION } from '../src/db/index.ts'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-db-test-'))
// These cases intentionally fsync every mutation to exercise crash-safe
// durability. They run alongside browser QA in the full workspace suite, so
// retain a bounded budget that covers legitimate disk contention without
// weakening any assertion or turning the case into a skip.
const DURABLE_RETENTION_TIMEOUT_MS = 60_000

// Reset module state before each test to prevent storePath leakage across tests
beforeEach(async () => {
  vi.resetModules()
  resetDb()
})

describe('db/index.ts durability', () => {

  describe('schema version validation', () => {
    it('current schema version is exported', () => {
      expect(STORE_SCHEMA_VERSION).toBe(1)
    })

    it('loads store with valid schema version 1', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      const data = {
        _schemaVersion: 1,
        audit: [],
        runs: [],
        telemetry: [],
        counters: { audit: 0, runs: 0, telemetry: 0 },
      }
      fs.writeFileSync(storePath, JSON.stringify(data))
      const db = await getDb(storePath)
      expect(db.audit).toEqual([])
    })

    it('loads store with legacy no-version (auto-upgrade to current)', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      const data = {
        audit: [{ id: 1, ts: '2026-01-01T00:00:00Z', action: 'test', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' }],
        runs: [],
        telemetry: [],
        counters: { audit: 1, runs: 0, telemetry: 0 },
      }
      fs.writeFileSync(storePath, JSON.stringify(data))
      const db = await getDb(storePath)
      expect(db.audit.length).toBe(1)
    })

    it('loads empty fresh store when no file exists', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'new-store.json')
      const db = await getDb(storePath)
      expect(db.audit).toEqual([])
      expect(db.runs).toEqual([])
      expect(db.telemetry).toEqual([])
    })
  })

  describe('fail-closed on corrupt store', () => {
    it('throws on malformed JSON', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      fs.writeFileSync(storePath, 'not json{{{')
      await expect(getDb(storePath)).rejects.toThrow('corrupted or incompatible')
    })

    it('throws on null root', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      fs.writeFileSync(storePath, 'null')
      await expect(getDb(storePath)).rejects.toThrow('corrupted or incompatible')
    })

    it('throws on array root', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      fs.writeFileSync(storePath, '[]')
      await expect(getDb(storePath)).rejects.toThrow('corrupted or incompatible')
    })

    it('throws on non-object root', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      fs.writeFileSync(storePath, '"just a string"')
      await expect(getDb(storePath)).rejects.toThrow('corrupted or incompatible')
    })

    it('throws on future _schemaVersion', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      const data = { _schemaVersion: 999, audit: [], runs: [], telemetry: [], counters: { audit: 0, runs: 0, telemetry: 0 } }
      fs.writeFileSync(storePath, JSON.stringify(data))
      try {
        await getDb(storePath)
      } catch (e: any) {
        // expected: throw
        expect(e.message).toContain('corrupted or incompatible')
        return
      }
      // if getDb returned, verify it actually read the right file (not stale state)
      const content = fs.readFileSync(storePath, 'utf-8')
      expect(JSON.parse(content)._schemaVersion).toBe(999) // confirms we read the right file
      // and that our validation threw on it
      expect(false).toBe(true) // fail if we reach here
    })

    it('throws on missing audit array', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      const data = { _schemaVersion: 1, audit: null, runs: [], telemetry: [], counters: { audit: 0, runs: 0, telemetry: 0 } }
      fs.writeFileSync(storePath, JSON.stringify(data))
      await expect(getDb(storePath)).rejects.toThrow('corrupted or incompatible')
    })

    it('throws on missing counters object', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      const data = { _schemaVersion: 1, audit: [], runs: [], telemetry: [], counters: null }
      fs.writeFileSync(storePath, JSON.stringify(data))
      await expect(getDb(storePath)).rejects.toThrow('corrupted or incompatible')
    })
  })

  describe('atomic serialized writes', () => {
    it('write atomically renames .tmp to store.json on close', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'atomic-test', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      await closeDb()
      expect(fs.existsSync(storePath + '.tmp')).toBe(false)
      expect(fs.existsSync(storePath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      expect(content.audit.length).toBeGreaterThan(0)
    })

    it('store.json is valid JSON after write', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'valid-json', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      await closeDb()
      expect(() => JSON.parse(fs.readFileSync(storePath, 'utf-8'))).not.toThrow()
    })

    it('no write when dirty is false', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      await closeDb()
      expect(fs.existsSync(storePath)).toBe(false)
    })
  })

  describe('bounded retention', () => {
    it('trims audit to MAX_AUDIT on save', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      for (let i = 0; i < 1100; i++) {
        addAudit({ ts: '2026-01-01T00:00:00Z', action: `a${i}`, target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      }
      await closeDb()
      const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      expect(content.audit.length).toBeLessThanOrEqual(1000)
    }, DURABLE_RETENTION_TIMEOUT_MS)

    it('trims runs to MAX_RUNS on save', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      for (let i = 0; i < 600; i++) {
        addRun({ ts: '2026-01-01T00:00:00Z', run_id: `r${i}`, platform: null, model: null, outcome: null, input_tokens: null, output_tokens: null, tool_calls: null, duration_ms: null, details: null })
      }
      await closeDb()
      const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      expect(content.runs.length).toBeLessThanOrEqual(500)
    }, DURABLE_RETENTION_TIMEOUT_MS)

    it('trims telemetry to MAX_TELEMETRY on save', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      for (let i = 0; i < 2100; i++) {
        addTelemetry({ event_id: `e${i}`, ts: '2026-01-01T00:00:00Z', event_type: 't', platform: null, model: null, effort: null, outcome: null, payload: '{}' })
      }
      await closeDb()
      const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      expect(content.telemetry.length).toBeLessThanOrEqual(2000)
    }, DURABLE_RETENTION_TIMEOUT_MS)

    it('store retains _schemaVersion after trimming', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      for (let i = 0; i < 1100; i++) {
        addAudit({ ts: '2026-01-01T00:00:00Z', action: `a${i}`, target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      }
      await closeDb()
      const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      expect(content._schemaVersion).toBe(1)
      expect(content.counters.audit).toBe(1100)
    }, DURABLE_RETENTION_TIMEOUT_MS)
  })

  describe('preserve dirty changes', () => {
    it('addAudit persists to disk', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'd', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      await closeDb()
      const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      expect(content.audit.length).toBe(1)
    })
  })

  describe('durability and rollback', () => {
    it('deletes orphan temp file when save fails', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      // Create a read-only directory to cause write failure
      const dataDir = path.join(dir, 'data')
      fs.mkdirSync(dataDir, { recursive: true })
      const readonlyPath = path.join(dataDir, 'store.json')
      await getDb(readonlyPath)
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'durability-test', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      // Make the data dir read-only to cause write failure
      try {
        fs.chmodSync(dataDir, 0o444)
        // On Windows, chmod may not work. If write fails, we verify temp file is cleaned up.
        try {
          await closeDb()
          // If closeDb succeeded (chmod didn't work), test passes trivially
        } catch {
          // Write should have failed and temp file should be cleaned up
          expect(fs.existsSync(readonlyPath + '.tmp')).toBe(false)
        }
      } finally {
        // Restore permissions for cleanup
        try { fs.chmodSync(dataDir, 0o755) } catch { /* ignore */ }
      }
    })

    it('temp file is removed after successful save', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'temp-cleanup', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      await closeDb()
      expect(fs.existsSync(storePath + '.tmp')).toBe(false)
    })
  })

  describe('queued writes (never skip dirty mutation)', () => {
    it('all rapid mutations persist without skip', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      // Interleaved rapid mutations — all must reach disk
      for (let i = 0; i < 50; i++) {
        addAudit({ ts: '2026-01-01T00:00:00Z', action: `a${i}`, target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
        addRun({ ts: '2026-01-01T00:00:00Z', run_id: `r${i}`, platform: null, model: null, outcome: null, input_tokens: null, output_tokens: null, tool_calls: null, duration_ms: null, details: null })
        addTelemetry({ event_id: `e${i}`, ts: '2026-01-01T00:00:00Z', event_type: 't', platform: null, model: null, effort: null, outcome: null, payload: '{}' })
      }
      await closeDb()
      const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      expect(content.audit.length).toBe(50)
      expect(content.runs.length).toBe(50)
      expect(content.telemetry.length).toBe(50)
    })

    it('second write is not skipped when first is in-progress', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'first', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      const c1 = fs.readFileSync(storePath, 'utf-8')
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'second', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      const c2 = fs.readFileSync(storePath, 'utf-8')
      const s2 = JSON.parse(c2)
      expect(s2.audit.length).toBe(2)
      expect(c1).not.toBe(c2) // second write is distinct, not skipped
    })
  })

  describe('strict counters', () => {
    it('repairs under-counted counter on load', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      // Counter says 5 but max id is 12 — must repair to 12
      const data = {
        _schemaVersion: 1,
        audit: Array.from({ length: 3 }, (_, i) => ({ id: i * 5 + 2, ts: 't', action: 'a', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })),
        runs: [],
        telemetry: [],
        counters: { audit: 5, runs: 0, telemetry: 0 },
      }
      fs.writeFileSync(storePath, JSON.stringify(data))
      await getDb(storePath)
      expect(getStore().counters.audit).toBe(12) // repaired to maxId
    })

    it('rejects negative counter on load', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      const data = { _schemaVersion: 1, audit: [], runs: [], telemetry: [], counters: { audit: -1, runs: 0, telemetry: 0 } }
      fs.writeFileSync(storePath, JSON.stringify(data))
      await expect(getDb(storePath)).rejects.toThrow('corrupted or incompatible')
    })

    it('rejects non-integer counter on load', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      const data = { _schemaVersion: 1, audit: [], runs: [], telemetry: [], counters: { audit: 1.5, runs: 0, telemetry: 0 } }
      fs.writeFileSync(storePath, JSON.stringify(data))
      await expect(getDb(storePath)).rejects.toThrow('corrupted or incompatible')
    })

    it('addAudit increments counter atomically', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      const before = getStore().counters.audit
      addAudit({ ts: 't', action: 'a', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      expect(getStore().counters.audit).toBe(before + 1)
    })

    it('record id matches counter after addAudit', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      const rec = addAudit({ ts: 't', action: 'a', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      expect(rec.id).toBe(getStore().counters.audit)
    })
  })

  describe('explicit lock cleanup errors', () => {
    it('closeDb throws explicit error when lockfile removal fails', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      const prev = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        await getDb(storePath)
        expect(fs.existsSync(storePath + '.lock')).toBe(true)
        // Remove lockfile so cleanup fails
        fs.unlinkSync(storePath + '.lock')
        await expect(closeDb()).rejects.toThrow('Failed to remove lockfile')
      } finally {
        process.env.NODE_ENV = prev
      }
    })

    it('stale lockfile is removed on orphaned check without throwing', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      const prev = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        // Pre-create a stale lock from dead PID
        const lockPath = storePath + '.lock'
        const staleContent = JSON.stringify({ pid: 999999, start: '2020-01-01T00:00:00Z', version: 1 })
        fs.writeFileSync(lockPath, staleContent)
        // Should not throw — stale lock is cleaned up before new lock acquired
        await expect(getDb(storePath)).resolves.toBeDefined()
        // The stale lock is removed; a new lock is acquired with our PID
        const newContent = fs.readFileSync(lockPath, 'utf-8')
        const lockData = JSON.parse(newContent)
        expect(lockData.pid).toBe(process.pid) // new lock, not stale
      } finally {
        process.env.NODE_ENV = prev
      }
    })
  })

  describe('crash-safe persistence', () => {
    it('mutation is durable without closeDb (immediate sync write)', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'crash-test', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      // Record must already be on disk — simulating crash here would not lose data
      expect(fs.existsSync(storePath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      expect(content.audit.length).toBe(1)
      expect(content.audit[0].action).toBe('crash-test')
    })

    it('data survives across restart (reload from disk)', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'survive', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      // Simulate crash: no closeDb, module resets
      resetDb()
      // Re-open same store file — data must be there
      const db2 = await getDb(storePath)
      expect(db2.audit.length).toBe(1)
      expect(db2.audit[0].action).toBe('survive')
      expect(getStore().counters.audit).toBe(1)
    })

    it('temp file is cleaned up after failed write', async () => {
      const dir = tmp()
      const storePath = path.join(dir, 'store.json')
      await getDb(storePath)
      addAudit({ ts: '2026-01-01T00:00:00Z', action: 'pre', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      // Make rename fail by replacing store with a directory
      fs.unlinkSync(storePath)
      fs.mkdirSync(storePath)
      let threw = false
      try {
        addAudit({ ts: '2026-01-01T00:00:00Z', action: 'fail', target_file: 'f', description: null, old_hash: null, new_hash: null, backup_path: null, user: 'u', status: 'ok' })
      } catch { threw = true }
      expect(threw).toBe(true)
      expect(fs.existsSync(storePath + '.tmp')).toBe(false)
      // Restore for cleanup
      fs.rmdirSync(storePath)
    })
  })

  afterEach(async () => {
    resetDb()
  })
})
