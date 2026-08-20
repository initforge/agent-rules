import { Router, type Response } from 'express'
import path from 'node:path'
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

export interface IntegrityFailureResponse {
  ok: false;
  code: 'INTEGRITY_FAILURE';
  error: string;
  details: {
    findings: Array<{ kind: string; detail: string }>;
  };
}

function sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
  const body: Record<string, unknown> = { ok: false, error: message, code }
  if (details) body.details = details
  res.status(status).json(body)
}

function sendIntegrityError(res: Response, err: PlanIntegrityError): void {
  const response: IntegrityFailureResponse = {
    ok: false,
    code: 'INTEGRITY_FAILURE',
    error: err.message,
    details: { findings: err.findings ?? [] },
  }
  res.status(409).json(response)
}

router.get('/', async (_req, res: Response) => {
  try {
    const root = findRoot()
    // listPlans fails closed (409) on structural corruption of the ledger
    // directory (bad filenames, symlinks, non-JSON artifacts). Additionally,
    // any ledger entry whose JSON cannot be parsed is corrupt and fails the
    // list closed (the plan-workspace reader would throw the same way).
    // A plan whose WORKSPACE cannot be read for non-corruption reasons
    // (legacy shape, per-plan integrity findings) is not listable and must
    // not take down the endpoint; per-plan detail stays available on
    // GET /api/plans/:id as 409 INTEGRITY_FAILURE.
    const planList = listPlans(root)
    const fs = await import('node:fs')
    const ledgerDir = path.join(root, '.agent', 'ledger')
    for (const { planId } of planList) {
      try { JSON.parse(fs.readFileSync(path.join(ledgerDir, `${planId}.json`), 'utf8')) }
      catch {
        return sendIntegrityError(res, new PlanIntegrityError([{ kind: 'MANIFEST', detail: `ledger entry ${planId}.json is not valid JSON` }]))
      }
    }
    const plans = planList.filter(({ planId }) => {
      try { readPlanWorkspace(planId, root); return true }
      catch { return false }
    })
    res.json({ ok: true, data: plans, total: plans.length, totalFound: planList.length })
  } catch (err) {
    if (err instanceof PlanValidationError) {
      sendError(res, 400, 'VALIDATION_ERROR', err.message)
    } else if (err instanceof PlanIntegrityError) {
      sendIntegrityError(res, err)
    } else {
      // Unexpected error: return empty list with warning rather than 500
      res.json({ ok: true, data: [], total: 0, totalFound: 0, warning: 'could not read plans' })
    }
  }
})

router.get('/:planId', (req, res: Response) => {
  try {
    const planId = req.params.planId || ''
    const workspace = readPlanWorkspace(planId)

    const ledger: Pick<WorkLedger, 'plan' | 'reconciliations' | 'repairSlices'> = {
      plan: workspace.plan,
      reconciliations: workspace.reconciliations,
      repairSlices: workspace.repairSlices,
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
      ...(workspace.canonicalSource ? { canonicalSource: workspace.canonicalSource } : {}),
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
      sendIntegrityError(res, err)
    } else {
      sendError(res, 500, 'INTERNAL', err instanceof Error ? err.message : String(err))
    }
  }
})

export default router
