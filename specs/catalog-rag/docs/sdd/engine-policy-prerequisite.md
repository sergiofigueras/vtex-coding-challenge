# Engine policy prerequisite: SDD-097

This is a one-time, human-reviewed bootstrap change to the reusable engine, not an implementation slice of `catalog-rag`.

## Why it is required

The root README already says that a product runtime may use a model when its own specification explicitly requires it. The shared `engine/.dsh/skills/sdd-delivery/SKILL.md` currently says unconditionally to keep every product runtime model-free. A true RAG answer adapter cannot satisfy both statements. The project runner is sandboxed to `projects/catalog-rag`, so it cannot safely repair `engine/` itself.

## Engine requirement entry

Add this requirement to `engine/docs/sdd/traceability.json`:

```json
{
  "id": "ENG-USR-010",
  "authority": "user",
  "summary": "Permit model-enabled product runtimes only when explicitly required by ready product specifications while preserving deterministic cores, offline tests, secret isolation, and separate runtime cost accounting.",
  "specIds": ["SDD-097"]
}
```

## Engine manifest entry

Add this specification after `SDD-096` in `engine/docs/sdd/manifest.json`:

```json
{
  "id": "SDD-097",
  "title": "Explicitly specified model-enabled product runtimes",
  "path": "docs/sdd/specs/97-model-enabled-product-runtime-policy.md",
  "kind": "infrastructure",
  "status": "ready",
  "dependsOn": ["SDD-090", "SDD-091", "SDD-092", "SDD-093"],
  "requirements": ["ENG-USR-010"],
  "acceptanceCriteria": ["AC-097-01", "AC-097-02", "AC-097-03", "AC-097-04"]
}
```

## Complete engine specification

Create `engine/docs/sdd/specs/97-model-enabled-product-runtime-policy.md`:

```md
# Explicitly specified model-enabled product runtimes

Spec ID: `SDD-097`
Status: `ready`
Kind: infrastructure specification
Depends on: `SDD-090`, `SDD-091`, `SDD-092`, `SDD-093`

## Policy

Product runtimes remain deterministic and model-free by default. A requested ready product specification may explicitly authorize a model or network adapter. That authorization is limited to the named adapter and acceptance criteria; it does not extend to deterministic domain logic, unrelated projects, tests, or delivery infrastructure.

Authorized adapters must be injected behind stable interfaces. Credentials stay server-side, normal tests and release gates use offline deterministic fakes, network access fails closed when not configured, and model output is treated as untrusted. Application runtime usage is accounted separately from OpenAI/Harness software-delivery usage.

## Acceptance criteria

- **AC-097-01:** The shared delivery skill states that product runtimes are model-free by default and permits a model/network adapter only when a requested ready product specification explicitly requires it.
- **AC-097-02:** The skill confines each exception to injected adapters and named acceptance criteria while requiring deterministic core logic and offline fake-provider release gates.
- **AC-097-03:** The policy requires server-side secret isolation, fail-closed configuration, untrusted-output validation, and separate application-runtime versus SDD-delivery usage accounting.
- **AC-097-04:** Engine tests prove that a model-free project retains the prohibition, an explicitly authorized project receives the bounded exception in its prompt, and dependency-only specifications cannot grant that exception.

## Proof plan

Add deterministic prompt-policy tests for prohibited, requested-authorized, and dependency-only cases; run engine tests, root checks, SDD validation, secret scans, and `git diff --check` without provider credentials or network access.

## Cost checkpoint

Implementation is a bounded engine-policy change. It does not itself invoke an application model or merge application runtime usage into the engine ledger.
```

## Skill amendment to implement under SDD-097

Replace the unconditional delivery-loop sentence with:

```md
Implement production code and executable evidence together. Keep product runtimes deterministic and model-free by default. A requested ready product specification may explicitly authorize model or network adapters; isolate them behind interfaces, preserve deterministic core logic and offline fakes, and do not widen that authorization beyond its acceptance criteria.
```

The implementation also needs the prompt-policy tests required by `AC-097-04`; changing only prose is insufficient.

After review, validate with:

```bash
npm run check
git diff --check
```

Then change SDD-097 status only according to the repository evidence policy. Do not run product specs that introduce live provider adapters until this bootstrap conflict is resolved.
