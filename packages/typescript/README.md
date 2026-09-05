# Regulation to Control API TypeScript SDK

Detect regulatory changes and map them to obligations, policies, controls, products and evidence requirements.

This package is the zero-runtime-dependency TypeScript/JavaScript client from
the audited public integration repository. It supports ESM and CommonJS on
Node.js 18 or newer. Import and construction perform no network request.

## Install

```sh
npm install controlgraph
```

## Authenticated client

```ts
import { RegulationControl } from 'controlgraph'

const client = new RegulationControl({
  apiKey: process.env.REGULATION_CONTROL_API_KEY,
})
```

Never place an API key in browser code, source control, logs, or examples.
Requesting a sandbox key is an email-verification and claim flow; it does not
return a key in the initial response.

- [Product, docs, demo, pricing, privacy, and terms](https://controlgraph-api.com/?utm_source=npm&utm_medium=package&utm_campaign=controlgraph&utm_content=readme)
- [Source and changelog](https://github.com/API-Disk-Integrations/controlgraph)
- [Issues](https://github.com/API-Disk-Integrations/controlgraph/issues)

Security reports must not be filed in a public issue. Use the repository's
private security-reporting path after the owner confirms it is enabled.

MIT licensed. The API service remains governed by the product site's terms.
