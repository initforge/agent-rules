import { Router, type Response } from 'express'
import {
  listPlans,
  readPlanWorkspace,
  findRoot,
  computeVerificationSummary,
  computeReconciliationMatrix,
} from '../schemas/plan-workspace.js'
import {
  PlanValidationError,
  PlanNotFoundError,
  PlanIntegrityError,
  LegacyRejectionError,
} from '@initforge/agent-rules-engine/plan-identity'
import type { WorkLedger } from '@initforge/agent-rules-engine/contracts'

const router = Router()

function sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
  const body: Record<string, unknown> = { ok: false, error: message, code }
  if (details) body.details = details
  res.status(status).json(body)
}

router.get('/', (_req, res: Response) => {
  try {
    const root = findRoot()
    const plans = listPlans(root)
    res.json({ ok: true, data: plans, total: plans.length })
  } catch (err) {
    if (err instanceof PlanValidationError) {
      sendError(res, 400, 'VALIDATION_ERROR', err.message)
    } else if (err instanceof PlanIntegrityError) {
      if (err.findings?.some((f: { kind?: string }) => String(f.kind).startsWith('MISSING_'))) {
        res.json({ ok: true, data: [], total: 0 })
      } else {
        sendError(res, 409, 'INTEGRITY_FAILURE', err.message, { findings: err.findings })
      }
    } else {
      sendError(res, 500, 'INTERNAL', err instanceof Error ? err.message : String(err))
    }
  }
})

router.get('/:planId', (req, res: Response) => {
  try {
    const planId = req.params.planId || ''
    const workspace = readPlanWorkspace(planId)

    const ledger: WorkLedger = {
      status: workspace.identity.status,
      plan: workspace.plan,
      planAnchors: workspace.planAnchors,
      batches: workspace.batches,
      amendments: workspace.amendments,
      assignments: workspace.assignments,
      receipts: workspace.receipts,
      verificationClaims: workspace.verificationClaims,
      attestations: workspace.attestations,
      reconciliations: workspace.reconciliations,
      repairSlices: workspace.repairSlices,
      sourceAcquisitionReceipts: workspace.sourceAcquisitionReceipts,
      orphanFindings: workspace.orphanFindings,
      shadowRevision: workspace.identity.shadowRevision,
      shadowHashes: workspace.shadowHashes,
      latestReview: workspace.latestReview,
    }

    const verification = computeVerificationSummary(workspace.verificationClaims)
    const reconciliationMatrix = computeReconciliationMatrix(ledger)

    const response: Record<string, unknown> = {
      ok: true,
      planId: workspace.planId,
      identity: workspace.identity,
      integrity: workspace.identity.integrity,
      integrityFindings: workspace.identity.integrityFindings,
      status: workspace.identity.status,
      plan: workspace.plan,
      originalMarkdown: workspace.originalMarkdown,
      amendments: workspace.amendments,
      planAnchors: workspace.planAnchors,
      reconciliations: workspace.reconciliations,
      reconciliationMatrix,
      batches: workspace.batches,
      assignments: workspace.assignments,
      receipts: workspace.receipts,
      verificationClaims: workspace.verificationClaims,
      verificationSummary: verification,
      attestations: workspace.attestations,
      repairSlices: workspace.repairSlices,
      orphanFindings: workspace.orphanFindings,
      sourceAcquisitionReceipts: workspace.sourceAcquisitionReceipts,
      latestReview: workspace.latestReview,
      shadowHashes: workspace.shadowHashes,
    }

    res.json(response)
  } catch (err) {
    if (err instanceof PlanValidationError) {
      sendError(res, 400, 'VALIDATION_ERROR', err.message)
    } else if (err instanceof PlanNotFoundError) {
      sendError(res, 404, 'NOT_FOUND', err.message)
    } else if (err instanceof LegacyRejectionError) {
      sendError(res, 422, 'LEGACY_SHAPE', err.message)
    } else if (err instanceof PlanIntegrityError) {
      sendError(res, 409, 'INTEGRITY_FAILURE', err.message, { findings: err.findings })
    } else {
      sendError(res, 500, 'INTERNAL', err instanceof Error ? err.message : String(err))
    }
  }
})

export default router
