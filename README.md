# Regulation to Control API

Detect regulatory changes and map them to obligations, policies, controls, products and evidence requirements.

- [Product and pricing](https://controlgraph-api.com/?utm_source=github&utm_medium=developer&utm_campaign=controlgraph-github&utm_content=readme#pricing)
- [Developer documentation](https://controlgraph-api.com/docs?utm_source=github&utm_medium=developer&utm_campaign=controlgraph-github&utm_content=readme)
- [Create a free account](https://controlgraph-api.com/signup?utm_source=github&utm_medium=developer&utm_campaign=controlgraph-github&utm_content=readme)
- [OpenAPI contract](https://controlgraph-api.com/openapi.json)
- [Postman collection](./postman_collection.json)

## Quickstart

### 1. Request a free-key verification email

```bash
curl -X POST https://controlgraph-api.com/v1/keys \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","source":{"source":"github","medium":"developer","campaign":"controlgraph-github","content":"readme"}}'
```

The service returns `202 Accepted` and sends a one-time claim link. Follow the
email, or exchange its token with `POST /v1/keys/claim`. The API key is shown
once after verification; store it securely. No card is required for the free
sandbox. Current free allowance: **50 mapped changes/month**.

### 2. Make the first product call

```bash
curl -X POST https://controlgraph-api.com/v1/changes \
  -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d '{"controls":[
        {"controlId":"CTL-014","name":"Disclosure template review",
         "owner":"Payments Compliance","status":"implemented",
         "tags":["payments","disclosure"],"lastTestedAt":"2026-07-01",
         "evidence":[{"kind":"policy_document","collectedAt":"2026-07-02"},
                     {"kind":"notification_record","collectedAt":"2026-07-14"}]}],
      "change":{
        "changeId":"REG-2026-0117","citation":"12 CFR 1026.19(e)",
        "title":"Revised cost-of-credit disclosures","jurisdiction":"US",
        "changeType":"amendment","publishedAt":"2026-03-02",
        "effectiveAt":"2026-09-01","transitionEndsAt":"2026-12-01",
        "obligations":[
          {"obligationId":"OB-1","type":"disclosure",
           "text":"Provide the revised disclosure within three business days.",
           "appliesTo":["payments","disclosure"],"enforcement":"penalty"}]}}\'
```

## SDKs

The repository includes dependency-light client files that point to the current
contract and canonical product domain:

- [Python SDK](./sdk/python/regulation_control.py) — reads `REGULATION_CONTROL_API_KEY`
- [TypeScript SDK](./sdk/typescript/index.ts)

Copy the file you need into your project. The OpenAPI document remains the
authoritative operation and schema contract.

## Authentication and errors

API operations use `Authorization: Bearer <API_KEY>` (or `x-api-key` where
documented). Dashboard-session operations and signed service webhooks are not
callable with a customer API key. Public demo and health operations require no
credential. Errors use a stable `error.code` plus a request ID for support.

## Distribution attribution

The key request above identifies this README with the stable tuple
`github / developer / controlgraph-github / readme`. The Postman collection and both
SDKs carry their own source metadata. Attribution is used to compare qualified
activation and retained use; it is not evidence that this channel already
performs.

## License

[MIT](./LICENSE)
