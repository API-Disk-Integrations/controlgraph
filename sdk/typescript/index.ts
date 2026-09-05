/**
 * Regulation to Control API client.
 *
 * Zero dependencies — uses the platform `fetch`, so it runs in Node 18+, Deno,
 * Bun and Cloudflare Workers without a bundler argument.
 *
 * NOT the browser: these endpoints need an API key and deliberately do not
 * support CORS. A key in front-end JavaScript is a published key.
 *
 * ```ts
 * const client = new RegulationControl()                  // reads REGULATION_CONTROL_API_KEY
 * const client = new RegulationControl({ apiKey: 'sp_live_…' })
 * ```
 *
 * Start free-key verification, then claim the token delivered by email:
 * ```
 * curl -X POST https://controlgraph-api.com/v1/keys \
 *   -H 'content-type: application/json' -d '{"email":"you@example.com","source":{"source":"sdk","medium":"typescript"}}'
 * ```
 *
 * WHAT THIS IS: arithmetic and graph mapping over inputs you supply — the
 * obligations you have read out of a regulatory change, and your own control
 * inventory. It does not read, interpret or apply law, and it is NOT legal
 * advice.
 *
 * Any penalty amount is an INTEGER number of minor units (cents). A fractional
 * amount is rejected by the API rather than rounded.
 */

const env = (name: string): string | undefined => (globalThis as any).process?.env?.[name]

/**
 * Override with REGULATION_CONTROL_BASE_URL, or pass `baseUrl`. The generated
 * API reference at /docs.html always carries the origin this deployment is on.
 */
export const DEFAULT_BASE_URL = env('REGULATION_CONTROL_BASE_URL') ?? 'https://controlgraph-api.com'

// --- catalogue codes -------------------------------------------------------
// Branch on these, never on the prose. GET /v1/obligation-types serves the
// same codes with their meanings, the preparation lead time per obligation
// type, and the exact priority weights.

export type ObligationType =
  | 'disclosure' | 'recordkeeping' | 'reporting' | 'notification' | 'consent'
  | 'data_protection' | 'access_control' | 'monitoring' | 'risk_assessment'
  | 'governance' | 'training' | 'third_party_oversight' | 'prohibition'

export type EvidenceKind =
  | 'policy_document' | 'control_test_result' | 'system_configuration' | 'audit_log'
  | 'training_record' | 'attestation' | 'risk_assessment' | 'third_party_report'
  | 'notification_record' | 'retention_schedule'

/**
 * `new_rule` and `amendment` set an evidence cut-off at `publishedAt`:
 * evidence gathered before a requirement existed cannot demonstrate it.
 * `guidance` and `enforcement_action` set none. A repeal is not modelled — it
 * creates no obligation; send the surviving obligations as an amendment.
 */
export type ChangeType = 'new_rule' | 'amendment' | 'guidance' | 'enforcement_action'

export type EnforcementLevel = 'penalty' | 'supervisory' | 'guidance'
export type ControlStatus = 'implemented' | 'planned' | 'in_remediation' | 'retired'

/** `gap` is a control to build; `weak` is a control to fix; `covered` is done. */
export type CoverageStatus = 'covered' | 'weak' | 'gap'

export type FindingCode =
  | 'no_control_mapped' | 'control_not_implemented' | 'control_retired'
  | 'control_untested' | 'control_stale' | 'control_unowned'
  | 'evidence_missing' | 'evidence_undated' | 'evidence_predates_change'
  | 'deadline_passed' | 'prepare_by_passed'

export type DeadlineKind = 'prepare_by' | 'effective' | 'transition_end'
export type DeadlineStatus = 'upcoming' | 'due_soon' | 'passed'
export type PriorityBand = 'critical' | 'high' | 'medium' | 'low'

// --- inputs ----------------------------------------------------------------

export interface EvidenceArtifact {
  kind: EvidenceKind
  artifactId?: string
  /** Undated evidence dates nothing and comes back as `evidence_undated`. */
  collectedAt?: string
}

export interface ControlInput {
  controlId: string
  name: string
  /** A control with no owner is reported — nobody will action it. */
  owner?: string
  status: ControlStatus
  /**
   * Scope tags. A control matches an obligation when its tags contain EVERY
   * tag the obligation requires. Trimmed, lower-cased, de-duplicated and
   * sorted by the API.
   */
  tags: string[]
  /** Missing is `control_untested`. */
  lastTestedAt?: string
  /** Defaults to 365. Older than this is `control_stale`. */
  testFrequencyDays?: number
  evidence?: EvidenceArtifact[]
}

export interface ObligationInput {
  obligationId: string
  type: ObligationType
  /** In your own words. Echoed, never parsed or interpreted. */
  text: string
  /** Required and non-empty: an obligation with no tags could never match. */
  appliesTo: string[]
  /** Overrides the obligation type's default evidence kinds. */
  requiresEvidence?: EvidenceKind[]
  /** Defaults to 'supervisory', and the response says when it assumed one. */
  enforcement?: EnforcementLevel
  /** Replaces the change's effective date for this obligation. */
  dueAt?: string
  /** Overrides the obligation type's catalogued lead time. */
  preparationDays?: number
  /** INTEGER minor units. Requires `currency` on the change. */
  maxPenaltyMinor?: number
}

export interface RegulatoryChangeInput {
  changeId: string
  citation: string
  title: string
  jurisdiction: string
  regulator?: string
  changeType: ChangeType
  publishedAt: string
  effectiveAt: string
  /** Must not be before `effectiveAt` — a grace period cannot pull a deadline forward. */
  transitionEndsAt?: string
  summary?: string
  /** ISO-4217. Required when any obligation records a `maxPenaltyMinor`. */
  currency?: string
  obligations: ObligationInput[]
  metadata?: Record<string, string>
}

// --- outputs ---------------------------------------------------------------

export interface Finding {
  code: FindingCode
  controlId?: string
  detail: string
}

export interface MatchedControl {
  controlId: string
  name: string
  owner: string | null
  status: ControlStatus
  /** The required tags this control carries. */
  matchedTags: string[]
  lastTestedAt: string | null
  daysSinceTest: number | null
  testFrequencyDays: number
  /** Implemented, tested and within its frequency. */
  operating: boolean
  issues: FindingCode[]
}

export interface EvidenceRequirement {
  kind: EvidenceKind
  satisfied: boolean
  satisfiedBy?: string
  artifactId?: string
  collectedAt?: string
  reason?: 'evidence_missing' | 'evidence_undated' | 'evidence_predates_change'
}

export interface Deadline {
  kind: DeadlineKind
  dueAt: string
  /** Whole UTC days. Negative once passed. */
  daysRemaining: number
  status: DeadlineStatus
  description: string
}

export interface Priority {
  /** 0–100, the sum of the four components. */
  score: number
  band: PriorityBand
  components: { enforcement: number; coverage: number; urgency: number; evidence: number }
  /** One line per component, then the total. Recompute it on paper if you like. */
  derivation: string[]
}

export interface ObligationAssessment {
  obligationId: string
  type: ObligationType
  text: string
  enforcement: EnforcementLevel
  /** True when `enforcement` was defaulted rather than stated. */
  enforcementAssumed: boolean
  requiredTags: string[]
  coverage: CoverageStatus
  coverageReason: string
  matchedControls: MatchedControl[]
  requiredEvidence: EvidenceRequirement[]
  /** Every finding, not the first. */
  findings: Finding[]
  deadlines: Deadline[]
  /** The later of the effective date and any transition end. */
  complianceDate: string
  daysToCompliance: number
  priority: Priority
  owners: string[]
  /** Your recorded penalty, carried only while coverage is not `covered`. */
  exposureMinor: number
}

export type GraphNodeType = 'change' | 'obligation' | 'control' | 'team' | 'evidence'
export type GraphEdgeKind = 'creates' | 'mapped_to' | 'owned_by' | 'requires_evidence' | 'evidenced_by'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  attributes: Record<string, string | number | boolean>
}

export interface GraphEdge {
  from: string
  to: string
  kind: GraphEdgeKind
  /** Why this edge exists. Always present — that is the point of the graph. */
  reason: string
}

export interface MappedChange {
  changeId: string
  citation: string
  title: string
  jurisdiction: string
  regulator: string | null
  changeType: ChangeType
  publishedAt: string
  effectiveAt: string
  transitionEndsAt: string | null
  /** Null for guidance and enforcement actions. */
  evidenceCutoff: string | null
  evaluatedAt: string
  summary: {
    obligations: number
    covered: number
    weak: number
    gaps: number
    controlsMatched: number
    controlsUnmatched: number
    teams: number
    highestPriority: PriorityBand | null
    earliestDeadline: string | null
    passedDeadlines: number
    unmetEvidenceKinds: number
  }
  /** Highest priority first, then soonest compliance date. */
  obligations: ObligationAssessment[]
  graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  unmatchedControls: string[]
  exposure: {
    currency: string
    totalMinor: number
    /** byOwner plus unassignedMinor sum EXACTLY to totalMinor. */
    byOwner: Array<{ owner: string; amountMinor: number }>
    unassignedMinor: number
  } | null
  warnings: string[]
}

export type ApiErrorCode =
  | 'invalid_api_key' | 'missing_api_key' | 'quota_exceeded' | 'rate_limited'
  | 'invalid_request' | 'not_found' | 'method_not_allowed' | 'payload_too_large'
  | 'conflict' | 'internal_error'

/**
 * Thrown for any non-2xx response.
 *
 * NOT thrown when an obligation comes back as a `gap` — that is a successful
 * answer, and usually the answer you bought the API for. On a 400,
 * `details.path` names the exact field that failed validation.
 */
export class ApiError extends Error {
  // Declared as fields rather than constructor parameter properties: those are
  // unsupported by strip-only TypeScript runtimes (Node --experimental-strip-types),
  // and an SDK should run without a build step.
  readonly status: number
  readonly code: ApiErrorCode | 'unknown'
  readonly requestId?: string
  readonly details?: unknown

  constructor(status: number, code: ApiErrorCode | 'unknown', message: string, requestId?: string, details?: unknown) {
    super(`[${status} ${code}] ${message}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

export interface ClientOptions {
  apiKey?: string
  baseUrl?: string
  /** Milliseconds. Default 30000. */
  timeoutMs?: number
  fetch?: typeof fetch
}

/** Optional acquisition metadata. Invalid values are ignored by the service. */
export interface KeySource {
  source?: string
  medium?: string
  campaign?: string
  content?: string
}

export interface MapRequest {
  /** Your control inventory. Required; may be empty, which returns every obligation as a gap. */
  controls: ControlInput[]
  change?: RegulatoryChangeInput
  /** Up to 50. The inventory is shared across the batch. */
  changes?: RegulatoryChangeInput[]
}

export interface MapResponse {
  count: number
  dueSoonWindowDays: number
  changes: MappedChange[]
  notice: string
  requestId: string
}

export class RegulationControl {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: ClientOptions = {}) {
    const key = options.apiKey ?? env('REGULATION_CONTROL_API_KEY')
    if (!key) {
      throw new Error(
        'No API key. Pass { apiKey } or set REGULATION_CONTROL_API_KEY. ' +
          'Request a free key verification email: POST ' + (options.baseUrl ?? DEFAULT_BASE_URL) + '/v1/keys',
      )
    }
    this.apiKey = key
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  private async request(method: string, path: string, body?: unknown, auth = true): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(this.baseUrl + path, {
        method,
        signal: controller.signal,
        headers: {
          ...(auth ? { authorization: `Bearer ${this.apiKey}` } : {}),
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const text = await res.text()
      const json = text ? JSON.parse(text) : {}
      if (!res.ok) {
        const e = json?.error ?? {}
        throw new ApiError(res.status, e.code ?? 'unknown', e.message ?? text.slice(0, 200), e.requestId, e.details)
      }
      return json
    } finally {
      clearTimeout(timer)
    }
  }

  /** Liveness and deployed version. Does not require a key. */
  async health(): Promise<{ ok: boolean; product: string; version: string }> {
    return this.request('GET', '/health', undefined, false)
  }

  /**
   * Map one regulatory change, or up to 50, against one control inventory.
   *
   * Billed one unit per CHANGE, not per control or per obligation — the
   * inventory is shared across the batch, so re-sending 400 controls to map a
   * second change costs nothing extra.
   */
  async map(req: MapRequest): Promise<MapResponse> {
    if ((req.change === undefined) === (req.changes === undefined)) {
      throw new Error('Pass exactly one of change or changes.')
    }
    return this.request('POST', '/v1/changes', req)
  }

  /** The real engine with no key: one change, 5 obligations, 20 controls. */
  async demoMap(req: { controls: ControlInput[]; change: RegulatoryChangeInput }): Promise<{ change: MappedChange; notice: string }> {
    return this.request('POST', '/v1/demo/map', req, false)
  }

  /**
   * The code catalogue: every enum with its meaning, the preparation lead time
   * per obligation type, and the exact priority weights — so a score in a
   * response can be recomputed on paper.
   */
  async obligationTypes(): Promise<Record<string, unknown>> {
    return this.request('GET', '/v1/obligation-types', undefined, false)
  }

  // --- convenience ---------------------------------------------------------

  /** Obligations with no control mapped at all. The work nobody has started. */
  static gaps(mapped: MappedChange): ObligationAssessment[] {
    return mapped.obligations.filter((o) => o.coverage === 'gap')
  }

  /** Obligations with a control that cannot currently satisfy them. */
  static weaknesses(mapped: MappedChange): ObligationAssessment[] {
    return mapped.obligations.filter((o) => o.coverage === 'weak')
  }

  /** Obligations whose compliance date is inside `days` — negative once passed. */
  static dueWithin(mapped: MappedChange, days: number): ObligationAssessment[] {
    return mapped.obligations.filter((o) => o.daysToCompliance <= days)
  }

  /** Request a free sandbox key; this emails a claim token. Claiming returns the key once. */
  static async createKey(email: string, opts: { baseUrl?: string; name?: string; source?: KeySource } = {}): Promise<any> {
    const res = await fetch((opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '') + '/v1/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        ...(opts.name ? { name: opts.name } : {}),
        source: opts.source ?? { source: 'sdk', medium: 'typescript' },
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'unknown', json?.error?.message ?? 'failed', json?.error?.requestId)
    return json
  }
}

export default RegulationControl

// ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
// Everything between these markers is written from openapi.json. Change the
// service, regenerate the contract, then re-run `npm run gen:sdk`.

/** The contract this SDK was generated from. */
export const API_TITLE = "Regulation to Control API"
export const API_VERSION = "1.0.0"
/** The origin the published contract names. `DEFAULT_BASE_URL` resolves to this unless overridden. */
export const API_BASE_URL = "https://controlgraph-api.com"

/**
 * Every `error.code` the contract publishes.
 *
 * The runtime companion to the `ApiErrorCode` union: a union is erased at
 * compile time, so a caller wanting to test an unknown string against the
 * documented set had nothing to test it with.
 */
export const ERROR_CODES = ["invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error"] as const

/** One published operation, exactly as the contract describes it. */
export interface OperationDescriptor {
  readonly operationId: string
  readonly method: string
  readonly path: string
  readonly summary: string
  /** True when the operation requires an API key. False does NOT mean public — see `authKind`. */
  readonly auth: boolean
  /**
   * The credential the operation actually takes.
   *
   * `api_key` — the bearer token this client sends.
   * `session` — the dashboard session cookie, plus `x-csrf-token` on writes.
   *             An API key is REFUSED: these endpoints change what you are
   *             billed and read your payment history, and a key that lives
   *             in CI must not reach them. Call them from the signed-in
   *             dashboard, not from this SDK.
   * `signature` — machine-to-machine; not callable by API consumers.
   * `public` — no credential at all.
   */
  readonly authKind: 'api_key' | 'session' | 'signature' | 'public'
  readonly pathParams: readonly string[]
  readonly queryParams: readonly string[]
  readonly requiredBodyFields: readonly string[]
  readonly successStatus: number | null
  /** Property names of the documented 2xx body. A field absent here is a field the service does not promise. */
  readonly responseFields: readonly string[]
}

/**
 * The published surface, generated. Ships with the client so an integration
 * can assert against the contract instead of against a changelog.
 */
export const OPERATIONS: readonly OperationDescriptor[] = [
  {
    operationId: "get/",
    method: "GET",
    path: "/",
    summary: "Service index — endpoints, auth and error format",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postApiBillingWebhook",
    method: "POST",
    path: "/api/billing/webhook",
    summary: "Square billing events, forwarded by the shared hub",
    auth: false,
    authKind: "signature",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "getHealth",
    method: "GET",
    path: "/health",
    summary: "Liveness and deployed version",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postV1Changes",
    method: "POST",
    path: "/v1/changes",
    summary: "Map regulatory changes onto your obligations, controls, evidence and deadlines",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["controls"],
    successStatus: 200,
    responseFields: ["count", "dueSoonWindowDays", "changes", "notice"],
  },
  {
    operationId: "postV1Checkout",
    method: "POST",
    path: "/v1/checkout",
    summary: "Start a hosted Square checkout for a paid tier",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["tier"],
    successStatus: 200,
    responseFields: ["checkoutUrl", "tier", "sku", "requestId"],
  },
  {
    operationId: "postV1DemoMap",
    method: "POST",
    path: "/v1/demo/map",
    summary: "Public demo — map one change with no API key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["controls", "change"],
    successStatus: 200,
    responseFields: ["change", "dueSoonWindowDays", "notice"],
  },
  {
    operationId: "getV1Invoices",
    method: "GET",
    path: "/v1/invoices",
    summary: "Every invoice issued against this account, newest first (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "invoices", "requestId"],
  },
  {
    operationId: "getV1Keys",
    method: "GET",
    path: "/v1/keys",
    summary: "List your API keys for this API",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "accountId", "keys", "requestId"],
  },
  {
    operationId: "postV1Keys",
    method: "POST",
    path: "/v1/keys",
    summary: "Request a free sandbox API key (sends a verification email)",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["email"],
    successStatus: 202,
    responseFields: ["status", "email", "expiresAt", "next", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRevoke",
    method: "POST",
    path: "/v1/keys/{id}/revoke",
    summary: "Revoke one of your API keys",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["id", "status", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRotate",
    method: "POST",
    path: "/v1/keys/{id}/rotate",
    summary: "Replace one of your API keys with a new secret",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"],
  },
  {
    operationId: "postV1KeysClaim",
    method: "POST",
    path: "/v1/keys/claim",
    summary: "Exchange an emailed claim token for the API key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["token"],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"],
  },
  {
    operationId: "getV1ObligationTypes",
    method: "GET",
    path: "/v1/obligation-types",
    summary: "The code catalogue: obligation types, evidence kinds, findings and the priority weights",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["obligationTypes", "evidenceKinds", "changeTypes", "controlStatuses", "coverageStatuses", "findingCodes", "deadlineKinds", "deadlineStatuses", "priority", "matchingRule"],
  },
  {
    operationId: "getV1Payments",
    method: "GET",
    path: "/v1/payments",
    summary: "Every payment attempted against this account and how it went (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "payments", "requestId"],
  },
  {
    operationId: "getV1Subscription",
    method: "GET",
    path: "/v1/subscription",
    summary: "Your current plan, billing window and available changes (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"],
  },
  {
    operationId: "postV1SubscriptionCancel",
    method: "POST",
    path: "/v1/subscription/cancel",
    summary: "Cancel this plan and end metered access (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"],
  },
  {
    operationId: "postV1SubscriptionPlan",
    method: "POST",
    path: "/v1/subscription/plan",
    summary: "Upgrade or downgrade to another plan (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["planId"],
    successStatus: 200,
    responseFields: ["changed", "direction", "from", "to", "entitlement", "billing", "requestId"],
  },
  {
    operationId: "getV1Usage",
    method: "GET",
    path: "/v1/usage",
    summary: "Your consumption and remaining allowance for this period",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"],
  },
]
// ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---
