"""
Regulation to Control API client.

Zero dependencies beyond the standard library — no requests, no httpx — so it
drops into any environment without a dependency negotiation.

    from regulation_control import RegulationControl

    client = RegulationControl()             # reads REGULATION_CONTROL_API_KEY
    client = RegulationControl("sp_live_…")  # or pass it explicitly

Start free-key verification, then claim the token delivered by email:

    curl -X POST https://controlgraph-api.com/v1/keys \
      -H 'content-type: application/json' -d '{"email":"you@example.com","source":{"source":"sdk","medium":"python"}}'

WHAT THIS IS: arithmetic and graph mapping over inputs you supply — the
obligations you have read out of a regulatory change, and your own control
inventory. It does not read, interpret or apply law, and it is NOT legal
advice.

Any penalty amount is an INTEGER number of minor units (cents). A fractional
amount is rejected by the API rather than rounded.
"""

from __future__ import annotations

import json as _json
import os
import urllib.error
import urllib.request

__all__ = [
    "RegulationControl", "ApiError",
    "OBLIGATION_TYPES", "EVIDENCE_KINDS", "CHANGE_TYPES", "CONTROL_STATUSES",
    "COVERAGE_STATUSES", "FINDING_CODES", "DEADLINE_KINDS", "PRIORITY_BANDS", "API_TITLE", "API_VERSION", "API_BASE_URL", "ERROR_CODES", "OPERATIONS"]

#: Override with REGULATION_CONTROL_BASE_URL, or pass base_url=. The generated
#: API reference at /docs.html always carries the origin this deployment is on.
DEFAULT_BASE_URL = os.environ.get("REGULATION_CONTROL_BASE_URL", "https://controlgraph-api.com")

#: Branch on these rather than on the human-readable prose, which may change.
#: GET /v1/obligation-types serves the same list with descriptions, the
#: preparation lead time for each type, and the exact priority weights.
OBLIGATION_TYPES = (
    "disclosure", "recordkeeping", "reporting", "notification", "consent",
    "data_protection", "access_control", "monitoring", "risk_assessment",
    "governance", "training", "third_party_oversight", "prohibition",
)

EVIDENCE_KINDS = (
    "policy_document", "control_test_result", "system_configuration", "audit_log",
    "training_record", "attestation", "risk_assessment", "third_party_report",
    "notification_record", "retention_schedule",
)

#: new_rule and amendment set an evidence cut-off at publishedAt: evidence
#: gathered before a requirement existed cannot demonstrate it. guidance and
#: enforcement_action set none. A repeal is not modelled — it creates no
#: obligation; send the surviving obligations as an amendment.
CHANGE_TYPES = ("new_rule", "amendment", "guidance", "enforcement_action")

CONTROL_STATUSES = ("implemented", "planned", "in_remediation", "retired")

#: gap  = nothing matched. weak = something matched but cannot satisfy it.
#: covered = an operating control plus every required evidence kind.
COVERAGE_STATUSES = ("covered", "weak", "gap")

FINDING_CODES = (
    "no_control_mapped",
    "control_not_implemented",
    "control_retired",
    "control_untested",
    "control_stale",
    "control_unowned",
    "evidence_missing",
    "evidence_undated",
    "evidence_predates_change",
    "deadline_passed",
    "prepare_by_passed",
)

DEADLINE_KINDS = ("prepare_by", "effective", "transition_end")

PRIORITY_BANDS = ("critical", "high", "medium", "low")


class ApiError(Exception):
    """
    Raised for any non-2xx response.

    NOT raised when an obligation comes back as a ``gap`` — that is a
    successful answer to a legitimate question, and usually the answer you
    bought the API for. On a 400, ``details["path"]`` names the exact field
    that failed validation.
    """

    def __init__(self, status: int, code: str, message: str, request_id: str | None = None, details=None):
        super().__init__(f"[{status} {code}] {message}")
        self.status = status
        self.code = code
        self.message = message
        self.request_id = request_id
        self.details = details


class RegulationControl:
    def __init__(self, api_key: str | None = None, *, base_url: str = DEFAULT_BASE_URL, timeout: float = 30.0):
        key = api_key or os.environ.get("REGULATION_CONTROL_API_KEY")
        if not key:
            raise ValueError(
                "No API key. Pass one to RegulationControl(...) or set "
                "REGULATION_CONTROL_API_KEY. Request a free key verification email: POST "
                '{}/v1/keys with {{"email": "you@example.com"}}'.format(base_url)
            )
        self.api_key = key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # -- transport ---------------------------------------------------------
    def _request(self, method: str, path: str, *, body=None, auth: bool = True) -> dict:
        data = _json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        if auth:
            req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Accept", "application/json")
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return _json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                err = _json.loads(raw).get("error", {})
            except Exception:
                err = {}
            raise ApiError(
                e.code, err.get("code", "unknown"), err.get("message", raw[:200]),
                err.get("requestId"), err.get("details"),
            ) from None

    # -- API ---------------------------------------------------------------
    def health(self) -> dict:
        """Liveness and deployed version. Does not require a key."""
        return self._request("GET", "/health", auth=False)

    def map_change(self, *, controls: list, change: dict | None = None, changes: list | None = None) -> dict:
        """
        Map one regulatory change, or up to 50, against one control inventory.

        Billed one unit per CHANGE, not per control or per obligation — the
        inventory is shared across the batch, so re-sending 400 controls to map
        a second change costs nothing extra.

        Returns, per change: coverage for every obligation (covered / weak /
        gap, deny-by-default), the controls each one matched and why, the
        evidence now required, three dated deadlines including the derived
        prepare-by date, a reproducible priority derivation, and the impact
        graph with a reason on every edge.
        """
        if (change is None) == (changes is None):
            raise ValueError("Pass exactly one of change= or changes=.")
        payload: dict = {"controls": controls}
        if changes is not None:
            payload["changes"] = changes
        else:
            payload["change"] = change
        return self._request("POST", "/v1/changes", body=payload)

    def demo_map(self, *, controls: list, change: dict) -> dict:
        """The real engine with no key: one change, 5 obligations, 20 controls."""
        return self._request("POST", "/v1/demo/map", body={"controls": controls, "change": change}, auth=False)

    def obligation_types(self) -> dict:
        """
        The code catalogue: every enum with its meaning, the preparation lead
        time per obligation type, and the exact priority weights — so a score
        in a response can be recomputed on paper.
        """
        return self._request("GET", "/v1/obligation-types", auth=False)

    # -- convenience -------------------------------------------------------
    @staticmethod
    def gaps(mapped: dict) -> list:
        """Obligations with no control mapped at all. The work nobody has started."""
        return [o for o in mapped["obligations"] if o["coverage"] == "gap"]

    @staticmethod
    def weaknesses(mapped: dict) -> list:
        """Obligations with a control that cannot currently satisfy them."""
        return [o for o in mapped["obligations"] if o["coverage"] == "weak"]

    @staticmethod
    def due_within(mapped: dict, days: int) -> list:
        """Obligations whose compliance date is inside ``days`` — negative once passed."""
        return [o for o in mapped["obligations"] if o["daysToCompliance"] <= days]

    @staticmethod
    def create_key(
        email: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        name: str | None = None,
        source: dict[str, str] | None = None,
    ) -> dict:
        """Request a free sandbox key; this emails a claim token. Claiming returns the key once."""
        payload: dict = {
            "email": email,
            "source": source if source is not None else {"source": "sdk", "medium": "python"},
        }
        if name:
            payload["name"] = name
        req = urllib.request.Request(
            base_url.rstrip("/") + "/v1/keys", data=_json.dumps(payload).encode(), method="POST"
        )
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as res:
            return _json.loads(res.read().decode())

# ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
# Everything between these markers is written from openapi.json. Change the
# service, regenerate the contract, then re-run `npm run gen:sdk`.

#: The contract this SDK was generated from.
API_TITLE = "Regulation to Control API"
API_VERSION = "1.0.0"
#: The origin the published contract names.
API_BASE_URL = "https://controlgraph-api.com"

#: Every ``error.code`` the contract publishes. Branch on these, never on the message.
ERROR_CODES = ("invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error")

#: The published surface, generated. Ships with the client so an integration
#: can assert against the contract instead of against a changelog.
OPERATIONS = (
    {
        "operation_id": "get/",
        "method": "GET",
        "path": "/",
        "summary": "Service index — endpoints, auth and error format",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postApiBillingWebhook",
        "method": "POST",
        "path": "/api/billing/webhook",
        "summary": "Square billing events, forwarded by the shared hub",
        "auth": False,
        "auth_kind": "signature",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "getHealth",
        "method": "GET",
        "path": "/health",
        "summary": "Liveness and deployed version",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postV1Changes",
        "method": "POST",
        "path": "/v1/changes",
        "summary": "Map regulatory changes onto your obligations, controls, evidence and deadlines",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("controls",),
        "success_status": 200,
        "response_fields": ("count", "dueSoonWindowDays", "changes", "notice"),
    },
    {
        "operation_id": "postV1Checkout",
        "method": "POST",
        "path": "/v1/checkout",
        "summary": "Start a hosted Square checkout for a paid tier",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("tier",),
        "success_status": 200,
        "response_fields": ("checkoutUrl", "tier", "sku", "requestId"),
    },
    {
        "operation_id": "postV1DemoMap",
        "method": "POST",
        "path": "/v1/demo/map",
        "summary": "Public demo — map one change with no API key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("controls", "change"),
        "success_status": 200,
        "response_fields": ("change", "dueSoonWindowDays", "notice"),
    },
    {
        "operation_id": "getV1Invoices",
        "method": "GET",
        "path": "/v1/invoices",
        "summary": "Every invoice issued against this account, newest first (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "invoices", "requestId"),
    },
    {
        "operation_id": "getV1Keys",
        "method": "GET",
        "path": "/v1/keys",
        "summary": "List your API keys for this API",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "accountId", "keys", "requestId"),
    },
    {
        "operation_id": "postV1Keys",
        "method": "POST",
        "path": "/v1/keys",
        "summary": "Request a free sandbox API key (sends a verification email)",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("email",),
        "success_status": 202,
        "response_fields": ("status", "email", "expiresAt", "next", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRevoke",
        "method": "POST",
        "path": "/v1/keys/{id}/revoke",
        "summary": "Revoke one of your API keys",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("id", "status", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRotate",
        "method": "POST",
        "path": "/v1/keys/{id}/rotate",
        "summary": "Replace one of your API keys with a new secret",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"),
    },
    {
        "operation_id": "postV1KeysClaim",
        "method": "POST",
        "path": "/v1/keys/claim",
        "summary": "Exchange an emailed claim token for the API key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("token",),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"),
    },
    {
        "operation_id": "getV1ObligationTypes",
        "method": "GET",
        "path": "/v1/obligation-types",
        "summary": "The code catalogue: obligation types, evidence kinds, findings and the priority weights",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("obligationTypes", "evidenceKinds", "changeTypes", "controlStatuses", "coverageStatuses", "findingCodes", "deadlineKinds", "deadlineStatuses", "priority", "matchingRule"),
    },
    {
        "operation_id": "getV1Payments",
        "method": "GET",
        "path": "/v1/payments",
        "summary": "Every payment attempted against this account and how it went (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "payments", "requestId"),
    },
    {
        "operation_id": "getV1Subscription",
        "method": "GET",
        "path": "/v1/subscription",
        "summary": "Your current plan, billing window and available changes (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionCancel",
        "method": "POST",
        "path": "/v1/subscription/cancel",
        "summary": "Cancel this plan and end metered access (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionPlan",
        "method": "POST",
        "path": "/v1/subscription/plan",
        "summary": "Upgrade or downgrade to another plan (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("planId",),
        "success_status": 200,
        "response_fields": ("changed", "direction", "from", "to", "entitlement", "billing", "requestId"),
    },
    {
        "operation_id": "getV1Usage",
        "method": "GET",
        "path": "/v1/usage",
        "summary": "Your consumption and remaining allowance for this period",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"),
    },
)
# ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---
