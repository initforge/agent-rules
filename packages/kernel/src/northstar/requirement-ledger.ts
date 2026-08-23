import crypto from 'node:crypto';
import type { PlannerContract } from './planner.js';

export type RequirementObligation = 'MUST' | 'SHOULD' | 'MAY';
export type RequirementPriority = 'HIGHEST' | 'HIGH' | 'NORMAL' | 'LOW';
export type RequirementEpistemic = 'FACT' | 'OBSERVATION' | 'UNKNOWN' | 'HYPOTHESIS';
export type RequirementDomain =
  | 'ui_ux'
  | 'frontend'
  | 'backend'
  | 'security'
  | 'data'
  | 'infra'
  | 'domain_a'
  | 'domain_b'
  | 'general';

export interface RequirementSourceSpan {
  start: number;
  end: number;
  snippet: string;
}

export interface RequirementLedgerItem {
  id: string;
  text: string;
  source_span: RequirementSourceSpan;
  obligation: RequirementObligation;
  priority: RequirementPriority;
  priority_reason?: string;
  epistemic_status: RequirementEpistemic;
  affected_domain: RequirementDomain;
  referenced_artifacts?: string[];
  mandatory: boolean; // true if obligation === 'MUST'
  covered_in_plan?: boolean;
  planned_verification?: string[];
}

export interface RequirementLedger {
  schema: 'harness/requirement-ledger/v1';
  version: 1;
  raw_intent: string;
  raw_intent_sha256: string;
  items: RequirementLedgerItem[];
  extracted_at: string;
  is_frozen?: boolean;
  frozen_hash?: string;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

const HIGHEST_PRIORITY_PATTERNS = [
  /\b(highest\s+priority|top\s+priority|p0|blocker|critical|urgent|must\s+fix\s+first|most\s+important)\b/i,
  /\b(quan\s+trọng\s+nhất|ưu\s+tiên\s+cao\s+nhất|lỗi\s+nghiêm\s+trọng\s+nhất|xử\s+lý\s+tận\s+gốc|khẩn\s+cấp|hàng\s+đầu)\b/i,
];

const HIGH_PRIORITY_PATTERNS = [
  /\b(high\s+priority|p1|major|important|required|essential|must\s+have)\b/i,
  /\b(quan\s+trọng|ưu\s+tiên|cần\s+sửa|bắt\s+buộc|chủ\s+yếu)\b/i,
];

const LOW_PRIORITY_PATTERNS = [
  /\b(low\s+priority|p2|p3|minor|nice\s+to\s+have|optional|if\s+possible|bonus)\b/i,
  /\b(ưu\s+tiên\s+thấp|không\s+bắt\s+buộc|tùy\s+chọn|nếu\s+được|phụ)\b/i,
];

const MUST_OBLIGATION_PATTERNS = [
  /\b(must|mandatory|shall|required|have\s+to|critical|p0|p1|cannot\s+proceed\s+without)\b/i,
  /\b(bắt\s+buộc|phải|cần\s+phải|dứt\s+khoát|yêu\s+cầu)\b/i,
];

const SHOULD_OBLIGATION_PATTERNS = [
  /\b(should|recommended|preferred|ought\s+to|advisable)\b/i,
  /\b(nên|khuyến\s+nghị|ưu\s+tiên\s+làm)\b/i,
];

const MAY_OBLIGATION_PATTERNS = [
  /\b(may|optional|can|could|nice\s+to\s+have|if\s+possible|if\s+time\s+permits)\b/i,
  /\b(có\s+thể|tùy\s+chọn|nếu\s+được|không\s+bắt\s+buộc)\b/i,
];

const HYPOTHESIS_PATTERNS = [
  /\b(might\s+be|could\s+be|suspect|suspected|hypothesis|possibly|perhaps|assumption)\b/i,
  /\b(có\s+thể\s+do|nghi\s+ngờ|giả\s+định|dường\s+như|chắc\s+là)\b/i,
];

const UNKNOWN_PATTERNS = [
  /\b(unknown|check\s+whether|investigate\s+if|not\s+sure|unclear|figure\s+out)\b/i,
  /\b(chưa\s+rõ|kiểm\s+tra\s+xem|chưa\s+biết|tìm\s+hiểu\s+xem)\b/i,
];

const FACT_PATTERNS = [
  /\b(error|exception|fails|crashes|throws|broken|returns\s+5\d\d|invalid|bug|defect)\b/i,
  /\b(lỗi|bị\s+lỗi|sập|bị\s+hỏng|trả\s+về\s+lỗi|không\s+chạy\s+được)\b/i,
];

const ARTIFACT_REGEX = /(?:[A-Za-z0-9_./\\-]+\.(?:png|jpe?g|webp|gif|svg|pdf|log|json|txt|pen|tsx?|jsx?|py|go|rs|java|html|css))/gi;

function detectPriority(text: string): { priority: RequirementPriority; reason?: string } {
  for (const pattern of HIGHEST_PRIORITY_PATTERNS) {
    const match = text.match(pattern);
    if (match) return { priority: 'HIGHEST', reason: `matched highest priority cue: "${match[0]}"` };
  }
  for (const pattern of HIGH_PRIORITY_PATTERNS) {
    const match = text.match(pattern);
    if (match) return { priority: 'HIGH', reason: `matched high priority cue: "${match[0]}"` };
  }
  for (const pattern of LOW_PRIORITY_PATTERNS) {
    const match = text.match(pattern);
    if (match) return { priority: 'LOW', reason: `matched low priority cue: "${match[0]}"` };
  }
  return { priority: 'NORMAL' };
}

function detectObligation(text: string, priority: RequirementPriority): RequirementObligation {
  if (priority === 'HIGHEST' || priority === 'HIGH') {
    return 'MUST';
  }
  for (const pattern of MUST_OBLIGATION_PATTERNS) {
    if (pattern.test(text)) return 'MUST';
  }
  for (const pattern of MAY_OBLIGATION_PATTERNS) {
    if (pattern.test(text)) return 'MAY';
  }
  for (const pattern of SHOULD_OBLIGATION_PATTERNS) {
    if (pattern.test(text)) return 'SHOULD';
  }
  return 'MUST';
}

function detectEpistemic(text: string): RequirementEpistemic {
  for (const pattern of UNKNOWN_PATTERNS) {
    if (pattern.test(text)) return 'UNKNOWN';
  }
  for (const pattern of HYPOTHESIS_PATTERNS) {
    if (pattern.test(text)) return 'HYPOTHESIS';
  }
  for (const pattern of FACT_PATTERNS) {
    if (pattern.test(text)) return 'FACT';
  }
  return 'OBSERVATION';
}

function detectDomain(text: string): RequirementDomain {
  const lower = text.toLowerCase();
  if (/\b(ui|ux|css|style|color|font|theme|dark\s+mode|light\s+mode|padding|margin|drawer|modal|dialog|button|layout|responsive|toast|view|giao\s+diện|màu|nút)\b/i.test(lower)) {
    return 'ui_ux';
  }
  if (/\b(security|auth|jwt|token|permission|role|secret|credential|sanitize|xss|sql\s+injection|bảo\s+mật|phân\s+quyền)\b/i.test(lower)) {
    return 'security';
  }
  if (/\b(database|sql|postgres|mysql|sqlite|prisma|migration|table|column|schema|bảng|cơ\s+sở\s+dữ\s+liệu)\b/i.test(lower)) {
    return 'data';
  }
  if (/\b(docker|compose|deploy|ci|cd|pipeline|nginx|k8s|kubernetes|container|hạ\s+tầng)\b/i.test(lower)) {
    return 'infra';
  }
  if (/\b(react|vue|angular|svelte|next|nuxt|component|hook|state|props|redux|zustand|frontend)\b/i.test(lower)) {
    return 'frontend';
  }
  if (/\b(api|endpoint|server|backend|grpc|http|rest|controller|service|middleware|route|xử\s+lý)\b/i.test(lower)) {
    return 'backend';
  }
  if (/\b(domain_a|synthetic_a|req_a|specialized_a)\b/i.test(lower)) {
    return 'domain_a';
  }
  if (/\b(domain_b|synthetic_b|req_b|specialized_b)\b/i.test(lower)) {
    return 'domain_b';
  }
  return 'general';
}

function extractArtifacts(text: string): string[] {
  const matches = text.match(ARTIFACT_REGEX);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.trim()))];
}

/**
 * Split natural language text into discrete requirement clauses while tracking
 * exact character offsets (source spans).
 */
function splitIntoClauses(raw: string): Array<{ text: string; start: number; end: number }> {
  const clauses: Array<{ text: string; start: number; end: number }> = [];

  // First, look for bullet points or numbered lists
  const bulletLines = raw.split(/\r?\n/);
  let currentOffset = 0;
  let hasBullets = false;

  for (const line of bulletLines) {
    const trimmed = line.trim();
    const isBullet = /^(?:[-*+]|\d+[.)])\s+/.test(trimmed);
    if (isBullet) {
      hasBullets = true;
      const match = line.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
      if (match && match[1]) {
        const text = match[1].trim();
        const start = currentOffset + line.indexOf(text);
        const end = start + text.length;
        if (text.length > 5) {
          clauses.push({ text, start, end });
        }
      }
    }
    currentOffset += line.length + 1;
  }

  if (hasBullets && clauses.length > 0) {
    return clauses;
  }

  // Sanitize sentence boundaries by temporarily protecting filenames and numbers with dots
  const protectedRaw = raw.replace(/\b(\w+)\.([a-zA-Z0-9_-]+)\b/g, '$1__DOT__$2');
  const sentencePattern = /([^.!?;\n]+[.!?;\n]+|[^.!?;\n]+$)/g;
  let match: RegExpExecArray | null;

  while ((match = sentencePattern.exec(protectedRaw)) !== null) {
    const rawProtectedSentence = match[0];
    const rawSentence = rawProtectedSentence.replace(/__DOT__/g, '.');
    const sentenceTrimmed = rawSentence.trim();
    if (sentenceTrimmed.length <= 5) continue;

    // Check for internal conjunctions that split major requirements:
    const subParts = sentenceTrimmed.split(/(?:,\s*(?:also|ngoài\s+ra|đồng\s+thời|kèm\s+theo|và\s+cả|plus)\s+|(?:\.\s+|\n+))/i);
    let subOffset = match.index;

    if (subParts.length > 1) {
      for (const part of subParts) {
        const partTrimmed = part.trim();
        const words = partTrimmed.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
        if (partTrimmed.length > 5 && words.length >= 2) {
          const start = raw.indexOf(partTrimmed, subOffset);
          const end = start + partTrimmed.length;
          clauses.push({ text: partTrimmed, start: start >= 0 ? start : subOffset, end: start >= 0 ? end : subOffset + partTrimmed.length });
          subOffset += part.length;
        }
      }
    } else {
      const words = sentenceTrimmed.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
      if (words.length >= 2) {
        const start = raw.indexOf(sentenceTrimmed, match.index);
        const end = start + sentenceTrimmed.length;
        clauses.push({ text: sentenceTrimmed, start: start >= 0 ? start : match.index, end: start >= 0 ? end : match.index + sentenceTrimmed.length });
      }
    }
  }

  if (clauses.length === 0 && raw.trim().length > 0) {
    const trimmed = raw.trim();
    const start = raw.indexOf(trimmed);
    clauses.push({ text: trimmed, start, end: start + trimmed.length });
  }

  return clauses;
}

/**
 * Extract a deterministic host-neutral RequirementLedger from raw user intent.
 */
export function extractRequirementLedger(rawIntent: string): RequirementLedger {
  const clauses = splitIntoClauses(rawIntent);
  const items: RequirementLedgerItem[] = [];

  const globalHighest = HIGHEST_PRIORITY_PATTERNS.some((p) => p.test(rawIntent));

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    const { priority: localPriority, reason: priorityReason } = detectPriority(clause.text);
    const epistemic = detectEpistemic(clause.text);
    const domain = detectDomain(clause.text);
    const artifacts = extractArtifacts(clause.text);

    let finalPriority = localPriority;
    let finalReason = priorityReason;

    if (globalHighest && localPriority === 'NORMAL' && (epistemic === 'FACT' || HIGHEST_PRIORITY_PATTERNS.some((p) => p.test(clause.text)))) {
      finalPriority = 'HIGHEST';
      finalReason = 'elevated to HIGHEST by prompt emphasis pattern';
    }

    const obligation = detectObligation(clause.text, finalPriority);

    items.push({
      id: `R-${String(i + 1).padStart(3, '0')}`,
      text: clause.text,
      source_span: {
        start: clause.start,
        end: clause.end,
        snippet: rawIntent.slice(Math.max(0, clause.start - 10), Math.min(rawIntent.length, clause.end + 10)),
      },
      obligation,
      priority: finalPriority,
      ...(finalReason ? { priority_reason: finalReason } : {}),
      epistemic_status: epistemic,
      affected_domain: domain,
      ...(artifacts.length ? { referenced_artifacts: artifacts } : {}),
      mandatory: obligation === 'MUST',
      covered_in_plan: false,
    });
  }

  if (items.length === 0) {
    const { priority, reason } = detectPriority(rawIntent);
    const obligation = detectObligation(rawIntent, priority);
    items.push({
      id: 'R-001',
      text: rawIntent,
      source_span: { start: 0, end: rawIntent.length, snippet: rawIntent },
      obligation,
      priority,
      ...(reason ? { priority_reason: reason } : {}),
      epistemic_status: detectEpistemic(rawIntent),
      affected_domain: detectDomain(rawIntent),
      referenced_artifacts: extractArtifacts(rawIntent),
      mandatory: obligation === 'MUST',
      covered_in_plan: false,
    });
  }

  return {
    schema: 'harness/requirement-ledger/v1',
    version: 1,
    raw_intent: rawIntent,
    raw_intent_sha256: sha256(rawIntent),
    items,
    extracted_at: new Date().toISOString(),
  };
}

/**
 * Freeze the requirement ledger before candidate planning.
 * Once frozen, items and obligations may not be downgraded.
 */
export function freezeRequirementLedger(ledger: RequirementLedger): RequirementLedger {
  const clone = JSON.parse(JSON.stringify(ledger)) as RequirementLedger;
  clone.is_frozen = true;
  clone.frozen_hash = sha256(JSON.stringify({
    raw_intent_sha256: clone.raw_intent_sha256,
    items: clone.items.map((i) => ({
      id: i.id,
      text: i.text,
      obligation: i.obligation,
      priority: i.priority,
      affected_domain: i.affected_domain,
    })),
  }));
  return clone;
}

function checkItemCoverage(item: RequirementLedgerItem, planText: string): boolean {
  const itemLower = item.text.toLowerCase();

  // 1. Direct inclusion
  if (planText.includes(itemLower)) return true;

  // 2. Token overlap ratio
  const itemWords = itemLower.match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const matchedCount = itemWords.filter((w) => planText.includes(w)).length;
  const ratio = itemWords.length > 0 ? matchedCount / itemWords.length : 0;
  if (ratio >= 0.35) return true;

  // 3. Domain & Concept cross-lingual matching (e.g. Vietnamese <-> English)
  const domain = item.affected_domain;
  if (domain === 'ui_ux') {
    const isButton = /\b(nút|button|btn|click|checkout)\b/i.test(itemLower);
    const isTheme = /\b(dark\s*mode|light\s*mode|theme|màu|color|background)\b/i.test(itemLower);
    const isLayout = /\b(drawer|modal|dialog|padding|margin|align|lệch|căn\s+lề)\b/i.test(itemLower);

    if (isButton && /\b(button|checkout|styling|btn|align)\b/i.test(planText)) return true;
    if (isTheme && /\b(dark\s*mode|theme|color|background|css\s+variables)\b/i.test(planText)) return true;
    if (isLayout && /\b(layout|responsive|drawer|modal|dialog|alignment)\b/i.test(planText)) return true;
    return /\b(ui|ux|css|styling|component|frontend)\b/i.test(planText);
  }
  if (domain === 'backend') {
    return /\b(api|endpoint|server|backend|controller|service|route|database)\b/i.test(planText);
  }
  if (domain === 'frontend') {
    return /\b(component|react|vue|state|hook|frontend|ui)\b/i.test(planText);
  }
  if (domain === 'security') {
    return /\b(auth|security|permission|token|jwt|sanitize)\b/i.test(planText);
  }
  if (domain === 'data') {
    return /\b(database|sql|table|migration|schema|data)\b/i.test(planText);
  }
  if (domain === 'infra') {
    return /\b(docker|deploy|ci|cd|nginx|k8s|container)\b/i.test(planText);
  }
  if (domain === 'domain_a') {
    return /\b(domain_a|synthetic_a|req_a|specialized_a)\b/i.test(planText);
  }
  if (domain === 'domain_b') {
    return /\b(domain_b|synthetic_b|req_b|specialized_b)\b/i.test(planText);
  }

  return false;
}

/**
 * Reconcile a candidate plan contract against the requirement ledger.
 * Updates `covered_in_plan` and `planned_verification` for each item.
 */
export function reconcileRequirementLedger(ledger: RequirementLedger, contract: PlannerContract): RequirementLedger {
  const planStatements = [
    ...contract.requirements.map((r) => r.statement),
    ...contract.tasks.map((t) => t.goal),
    ...(contract.known ?? []),
    ...(contract.assumed ?? []),
  ].map((s) => s.toLowerCase());

  const planText = planStatements.join(' \n ');
  const verifierIds = new Set(contract.verifiers.map((v) => v.id));

  const updatedItems = ledger.items.map((item) => {
    const covered = checkItemCoverage(item, planText);

    // Find verifiers mapped to tasks that claim this requirement
    const verifiers: string[] = [];
    if (covered) {
      for (const task of contract.tasks) {
        if (task.verifiers_by_claim) {
          for (const vIds of Object.values(task.verifiers_by_claim)) {
            verifiers.push(...vIds.filter((id) => verifierIds.has(id)));
          }
        }
        if (task.verifier_by_claim) {
          for (const vId of Object.values(task.verifier_by_claim)) {
            if (vId && verifierIds.has(vId)) verifiers.push(vId);
          }
        }
      }
    }

    return {
      ...item,
      covered_in_plan: covered,
      ...(verifiers.length ? { planned_verification: [...new Set(verifiers)] } : {}),
    };
  });

  return {
    ...ledger,
    items: updatedItems,
  };
}
