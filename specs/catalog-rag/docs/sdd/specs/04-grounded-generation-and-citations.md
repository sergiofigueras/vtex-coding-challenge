# Grounded answer generation and citation enforcement

Spec ID: `SDD-004`
Status: `ready`
Kind: product specification
Depends on: `SDD-003`

## Answer-provider contract

Define an injected `AnswerProvider` that accepts the normalized user question, bounded instructions, and a bounded list of rehydrated product evidence. Catalog values and the question are untrusted data, are structurally delimited from instructions, and cannot select tools, URLs, database paths, or provider configuration.

The provider must return structured data equivalent to:

```ts
interface GroundedAnswer {
  answer: string | null;
  abstained: boolean;
  citationIds: string[];
}
```

Each server-created citation ID maps to one retrieved `Product.Id`; the model never invents that mapping. Parse provider output against a strict schema, bound answer length and citation count, reject HTML or control data, and verify that every returned citation is a unique member of the supplied evidence. An invalid answer is not repaired through an unbounded second model call.

## Grounding and failure semantics

Instructions require answers only from supplied evidence, disclosure when the catalog lacks the requested field, and abstention when evidence is empty or insufficient. Product descriptions, price, inventory, compatibility, ratings, and specifications cannot be claimed unless future source specs add those fields.

Return one of three stable application states:

- `answered`: a validated grounded answer and citations are available;
- `insufficient_evidence`: retrieval cannot support an answer and no provider call is needed;
- `answer_unavailable`: retrieval succeeded but the provider timed out, failed, or returned invalid output; the retrieved products remain usable.

Provider identity, timeout, abort signal, token/output ceiling, and bounded retry policy are explicit. A deterministic offline fake is the default test provider; a live adapter is opt-in and this specification explicitly authorizes only that adapter to call a configured model endpoint.

## Acceptance criteria

- **AC-004-01:** The answer provider receives only the user question, bounded instructions, and rehydrated retrieved evidence, and every returned citation is validated against that evidence before release.
- **AC-004-02:** No-result, insufficient-evidence, provider-failure, timeout, malformed-output, and invalid-citation paths return an explicit abstention or sanitized service state rather than unsupported catalog claims.
- **AC-004-03:** Product and query text are delimited and treated as untrusted data; tests cover prompt-injection-shaped names, brands, categories, sellers, seller-product identifiers, and questions.
- **AC-004-04:** The answer contract has bounded text and citation counts, stable `answered`, `insufficient_evidence`, and `answer_unavailable` states, no unsupported source fields, and no unbounded repair loop.
- **AC-004-05:** A deterministic fake provider proves grounding and citation behavior offline; credentialed live smoke tests are opt-in, redact all sensitive inputs, and never form part of the default release gate.

## Proof plan

Test exact evidence serialization, empty and weak evidence, valid citations, duplicate and unknown citations, malicious catalog text, malicious questions, HTML-shaped output, malformed JSON, excessive output, timeout, abort, retry exhaustion, and provider failure. No default test may access the network or environment credentials.

## Cost checkpoint

Record answer-provider input/output units and cost when supplied by the provider. Unknown usage or price is `unavailable`, never zero, and remains separate from Harness delivery cost.
