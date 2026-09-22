# Accessible text-search web interface

Spec ID: `SDD-006`
Status: `ready`
Kind: product specification
Depends on: `SDD-005`

## Objective

Provide a responsive Brazilian Portuguese web interface inside `projects/catalog-rag` for submitting one free-text catalog query, reading a grounded answer, and inspecting the products and sellers that support it. The browser communicates only with same-origin `/api/*` endpoints and never accesses SQLite or a model provider directly.

## Interface contract

The document declares `lang="pt-BR"` and contains semantic header, main, search form, answer region, results region, and footer. The form has a persistent visible `Buscar no catálogo` label, a text input, helper text stating that answers use only catalog evidence, and a `Buscar` button. Native form submission supports Enter; client validation mirrors the server's 2-to-500-code-point rule but never replaces server validation.

The UI has eight explicit states:

1. `checking-health` while service and index readiness are checked;
2. `ready-empty` before a query;
3. `submitting` with textual progress and duplicate submission disabled;
4. `answered` with answer, citations, count, and ordered product cards;
5. `insufficient-evidence` with a catalog-limitation explanation;
6. `answer-unavailable` with retrieved results and no invented answer;
7. `index-unavailable` with actionable indexing/refresh guidance;
8. `request-error` with a safe message and retry action.

A product card shows the supplied name, `Product.Id`, brand or `Não informada`, category or `Não informada`, seller names and seller-product IDs/SKUs, plus retrieval-channel labels when useful. Citation links use server-issued citation IDs and move keyboard focus to the corresponding card. Never present raw similarity as confidence or infer a citation absent from the response.

## Interaction, safety, and accessibility

A new submission aborts the previous request, and a slower previous response cannot overwrite the current state. Preserve the submitted text after success or error. Retry repeats only the last user-authorized query. Move focus to the result heading after completion and announce the result through an `aria-live="polite"` status region. Validation and request errors use `role="alert"` and are associated with the input.

Render answer and catalog values as inert text with `textContent`, never `innerHTML`. Do not use cookies, local storage, analytics, query history, provider SDKs, external fonts/scripts, or console logging of request/response content. The production bundle contains no secret, model URL, provider credential, database path, or inline script.

Target WCAG 2.2 AA: keyboard operation, visible focus, semantic headings, ordered results, programmatic labels, AA contrast, status not conveyed by color alone, reduced motion, practical 44-by-44 CSS-pixel targets, 200 percent zoom support, and no page-level horizontal overflow at 320 CSS pixels. Long product and seller values wrap without clipping.

Build deterministic static assets into `dist/web/`. Use framework-free HTML, CSS, and strict TypeScript unless a later spec justifies another client dependency. Browser tests use the offline API/fake-provider stack.

## Acceptance criteria

- **AC-006-01:** A keyboard-only user can enter, submit, retry, follow citations, and inspect every result field with visible focus, semantic landmarks, programmatic labels, and correct focus movement.
- **AC-006-02:** All eight UI states render deterministically from API fixtures in Portuguese, with no stale answer, results, warning, or error leaking between queries.
- **AC-006-03:** An answered response displays exactly the answer, citations, ordered products, sellers, identifiers, missing-value labels, and retrieval-channel labels supplied by the API.
- **AC-006-04:** Insufficient evidence, unavailable generation, stale index, validation failure, timeout, overload, and generic request failure remain distinct and actionable without invented fallback content.
- **AC-006-05:** Injection-shaped answer and catalog values render as inert literal text; the production bundle contains no provider secret, SDK, model call, database path, inline script, unsafe HTML rendering, persistent user data, or analytics.
- **AC-006-06:** Automated accessibility checks report no WCAG A/AA violation in empty, loading, success, no-evidence, partial-success, and error states, and the named keyboard, focus, label, and announcement checks pass.
- **AC-006-07:** Browser tests at 320 by 720 and 1280 by 800 prove no page-level horizontal overflow, no clipped product identifiers, readable 200 percent zoom, reduced-motion behavior, and usable controls.
- **AC-006-08:** Starting a new search or leaving the page aborts the previous request, duplicate submits do not create parallel requests, a late response cannot overwrite current state, and the current query remains available for correction.

## Proof plan

Use deterministic API fixtures and a complete offline server with fake providers. Unit tests cover rendering and state transitions. Browser tests cover form submission, focus, keyboard navigation, retry, abort, citation navigation, hostile text, security headers, accessibility, zoom, reduced motion, and both viewport sizes. Test semantic state and layout invariants instead of pixel-perfect screenshots.

## Cost checkpoint

UI build and verification are model-free. Browser tests inject provider fakes and never consume runtime provider tokens.
