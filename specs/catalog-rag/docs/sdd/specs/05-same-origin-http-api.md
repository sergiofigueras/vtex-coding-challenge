# Same-origin HTTP API

Spec ID: `SDD-005`
Status: `ready`
Kind: product specification
Depends on: `SDD-003`, `SDD-004`

## Objective and startup

Expose retrieval and grounded answering through a local `node:http` service that also serves the built UI. The public command accepts explicit `--catalog-db` and `--rag-db` paths plus validated `--host`, `--port`, request timeout, and concurrency settings. It binds to `127.0.0.1` by default, opens the catalog read-only, validates a complete ready index, and makes no provider call during health checks.

The browser cannot supply database paths, provider names, model IDs, prompts, API keys, arbitrary SQL, or arbitrary file paths. UI and API are same-origin by default; permissive CORS is disabled.

## HTTP contract

`GET /api/health` returns a versioned JSON readiness summary for process, catalog, index, and configured providers. It returns `200` only when queries are serviceable and otherwise returns a sanitized `503` state such as `missing`, `building`, `stale`, `failed`, or `incompatible`.

`POST /api/search` accepts only `application/json` with this closed shape:

```json
{
  "query": "Quais notebooks Lenovo aparecem no catálogo?",
  "filters": {
    "brand": "Lenovo",
    "category": "Notebook",
    "seller": "Seller A"
  },
  "topK": 8
}
```

Normalize `query` to Unicode NFC after trimming. Require 2 to 500 Unicode code points, a `topK` integer from 1 to 20, bounded optional filters, a 16 KiB request body, and no unknown fields.

A successful JSON response contains `schemaVersion`, opaque `requestId`, normalized `status`, answer or abstention, validated citations, ranked rehydrated product results, stable warnings, and per-stage timings. Each result exposes only available `Product.Id`, name, brand, category, ordered sellers, seller-product identifiers, rank, and retrieval channels. It does not expose vectors, raw prompts, model payloads, source paths, or raw similarity as confidence.

Use `400` for invalid JSON or fields, `413` for an oversized body, `415` for unsupported media type, `409` for a stale/incompatible index, `429` for bounded overload, `502` for an unusable upstream response, `503` for unavailable index/provider, and a sanitized `500` for an unexpected failure. Error envelopes are versioned and contain only request ID, stable code, safe message, and retryability.

## Degraded behavior and security

If semantic retrieval is unavailable but exact or lexical retrieval succeeds, return those results with `SEMANTIC_RETRIEVAL_UNAVAILABLE`. If answer generation is unavailable, return the retrieval results with `answer_unavailable`, never invented fallback text.

Send `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive same-origin Content Security Policy that disallows inline scripts, objects, framing, and cross-origin connections. Serve only allow-listed built assets, reject traversal, and never route `/api/*` failures to the HTML fallback. Propagate deadlines, client disconnects, and shutdown through `AbortSignal`.

## Acceptance criteria

- **AC-005-01:** `GET /api/health` reports process, catalog, ready-index, and configured-provider readiness without a provider call or exposure of paths, credentials, prompts, vectors, or document content.
- **AC-005-02:** `POST /api/search` accepts the documented closed JSON request and returns a versioned response containing request ID, answer or abstention, validated citations, ranked product results, stable warnings, and stage timings.
- **AC-005-03:** Invalid JSON, unknown fields, invalid Unicode length, invalid filters or `topK`, oversized bodies, and unsupported media types fail with the documented sanitized status and error code before retrieval or generation.
- **AC-005-04:** Requests propagate configured deadlines, client disconnect cancellation, and process shutdown through retrieval and generation; overload and upstream/index unavailability produce explicit retryable responses.
- **AC-005-05:** The server serves only allow-listed built UI assets from the same origin, binds to loopback by default, disables permissive CORS, rejects path traversal, and never turns an API failure into HTML.
- **AC-005-06:** Responses carry the required security headers, every SQL value is parameterized, generated citations resolve to returned results, and logs/errors contain no secret, raw prompt, raw query, catalog path, response body, or stack trace.
- **AC-005-07:** A semantic or answer-provider failure preserves usable exact/lexical results with a stable degraded warning or state and never fabricates an answer.

## Proof plan

Use temporary SQLite files, an ephemeral port, injected providers, an injected request-ID generator, and blocked network access. Cover each request/response variant and status code, unknown fields, Unicode boundaries, body boundaries, traversal, SQL-shaped input, malicious provider output, stale index, overload, timeout, disconnect, and graceful shutdown.

## Cost checkpoint

API contract and lifecycle tests are model-free. Runtime calls made behind injected adapters are recorded by the application, not by the SDD engine ledger.
