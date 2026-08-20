import { Router, type Response } from 'express'
import { m11View } from '../schemas/m11.js'

const router = Router()

const VIEW_NAMES = ['readiness', 'dag', 'conflicts', 'worktrees', 'agents', 'resources', 'topology', 'parity', 'waits', 'gates', 'calibration'] as const

router.get('/views', (_req, res: Response) => {
  res.json({ ok: true, data: VIEW_NAMES })
})

for (const name of VIEW_NAMES) {
  router.get(`/${name}`, (_req, res: Response) => {
    try {
      const data = m11View[name]()
      res.json(data)
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}

export default router
