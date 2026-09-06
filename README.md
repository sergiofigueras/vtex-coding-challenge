# VTEX Catalog Consolidation — SDD Agent Infrastructure

This repository is the delivery infrastructure and specification package for the catalog consolidation exercise. It intentionally does **not** contain the catalog application yet.

DeepSeek Harness orchestrates the engineering agent; OpenAI supplies every model call. The workflow turns a selected, dependency-ordered subset of the product specs into a bounded headless implementation run, verifies the result, and maps provider cost back to the change.

## What is ready

- Nine product specs (`SDD-000`–`SDD-008`) covering the boundary, input, SQLite migration, deterministic identity, consolidation, security, tests, and delivery.
- Three verified infrastructure specs (`SDD-090`–`SDD-092`) covering Harness, OpenAI cost control, traceability, and release gates.
- Pinned public fixture URLs, byte sizes, and SHA-256 hashes; downloads stay private under `.sdd/`.
- DeepSeek Harness `0.1.2-rc.1`, an isolated headless runner, a project-local SDD skill, and an offline configuration smoke test.
- OpenAI-only routing: Terra is the default, Luna is the economy model, and Sol is escalation-only.
- Pre-call and live budget gates, provider-usage extraction, integer price arithmetic, and an append-only hash-chained per-change ledger.

## Why DeepSeek Harness

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is useful here because it is not a monolithic coding agent tied to one model vendor. It is an agent runtime built as a tree of replaceable plugins on [Cordis](https://github.com/cordiverse/cordis). The architectural foundation is described in the DeepSeek/Peking University paper [*A Programming Paradigm for Spatiotemporal Composability*](https://arxiv.org/abs/2608.25512); the concrete Harness wiring is documented in the upstream [architecture guide](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.md).

That combination provides several practical advantages for this project:

- **OpenAI without a Harness fork.** The model adapter and default-model selector are ordinary plugins. This repository replaces their configuration with the `openai` Responses route while retaining the Harness agent loop, tools, persistence, policy, and session machinery.
- **Small, reviewable composition.** Profiles assemble bundles and ordered patch layers. The checked-in base patch defines the common OpenAI catalog and safety limits; the economy and escalation overlays change only the intended route policy.
- **Lifecycle-safe extensibility.** Cordis tracks context-mediated effects together with their cleanup operations. Removing a component can unwind registrations and resources in last-in-first-out order instead of relying on a distant, easy-to-forget global teardown path.
- **Reactive dependencies.** Components declare what they require and provide. A dependent activates only when its requirements resolve, deactivates before a provider is withdrawn, and can reactivate when a compatible provider returns.
- **Durable auditability.** Model inputs, messages, attempts, tool calls, and results become session events. Successful, failed, cancelled, and retried attempts can therefore be audited and included in cost rather than only the final answer surviving.
- **Capability seams.** Models, tools, filesystem access, subprocesses, sandboxes, approvals, persistence, skills, and interfaces are swappable service-provider seams. Policy can intercept those seams without rewriting the agent loop.
- **Cost containment.** A small spec-scoped prompt, restricted tools, no hidden subagent fan-out, exact model routes, durable usage events, and an outer budget supervisor make the cost of a change observable and subject to conservative reservations and stop thresholds.

The project still pins Harness because upstream labels it a developer preview and warns that compatibility-breaking changes should be expected.

## Architectural foundation: spatiotemporal composability

The paper starts from two independent problems in dynamically changing systems:

| Dimension | Question | Cordis mechanism | Practical result |
|---|---|---|---|
| Temporal composability | What must be undone when a component leaves? | **Revertible effects:** a context transformation returns an inverse, accumulated by the runtime | Component-local teardown can restore context-mediated state without restarting the process |
| Spatial composability | What happens when a dependency appears, disappears, or changes provider? | **Reactive coeffects:** required and provided keys are resolved against a changing context | Dependents activate, deactivate, or reload as their declared dependency view changes |

Cordis unifies both mechanisms in one first-class context. A component is conceptually a triple:

1. the coeffects it **requires** from its environment;
2. the keys/services it **provides** to the environment;
3. the effect function it runs, whose context-mediated changes yield inverse operations.

Each component instance is a **fiber** with its own context, parent, dependency view, accumulated disposer, and lifecycle state. The paper's runtime correspondence is approximately `ctx.effect` for reversible effects, `ctx.get`/`ctx.set` for coeffects, `ctx.use` for component instantiation, and `fiber.dispose` for the accumulated inverse.

```mermaid
flowchart LR
  subgraph Paper["Formal model"]
    E["Revertible effects<br/>action + inverse"]
    C["Reactive coeffects<br/>requires + provides"]
    U["Unified context<br/>all mediated interaction"]
    E --> U
    C --> U
  end

  subgraph Cordis["Cordis runtime"]
    F["Component fiber"]
    L["Inactive -> Reloading -> Active -> Unloading"]
    R["Dependency resolution + notification"]
    D["LIFO disposer accumulation"]
    F --> L
    R --> L
    L --> D
  end

  subgraph Harness["DeepSeek Harness"]
    P["Plugin tree"]
    S["Services and capability seams"]
    V["Durable session events"]
    P --> S
    S --> V
  end

  U --> F
  Cordis --> P
```

The lifecycle is reactive rather than directly controlled by a plugin. The orchestrator requests insertion or retirement; the runtime decides when activation and deactivation are safe:

```mermaid
stateDiagram-v2
  [*] --> Inactive: insert fiber
  Inactive --> Reloading: requirements satisfied
  Reloading --> Reloading: run next effect step
  Reloading --> Active: activation completed
  Reloading --> Unloading: target dependency view changed
  Active --> Unloading: retired or dependency changed
  Unloading --> Inactive: dependents drained and inverses applied
  Inactive --> [*]: retired, empty, no children
```

During activation, inverses are accumulated in last-in-first-out order. During withdrawal, a provider first stops advertising availability, its dependents are allowed to finish asynchronous teardown, and only then are the provider's own inverses applied. This ordering is the key connection between temporal cleanup and spatial dependency safety. Declarative configuration sits above the fibers: stable entry IDs, module URLs, configuration, isolation, interception, and enabled state are reconciled into the least disruptive fiber operations. Hot module replacement uses the same disposal/recreation machinery and rolls back to cached modules if a reload fails.

## DeepSeek Harness runtime architecture

A running `dsh` process is assembled from configuration rather than a privileged hard-coded core:

```mermaid
flowchart TB
  CLI["dsh CLI"] --> PROFILE["headless profile"]
  PROFILE --> BASE["dsh-base bundle"]
  BASE --> PROJECT["automation.patch.yml"]
  PROJECT --> ROUTE{"selected route"}
  ROUTE -->|economy| LUNA["economy.patch.yml<br/>OpenAI GPT-5.6 Luna / low"]
  ROUTE -->|default| TERRA["OpenAI GPT-5.6 Terra / medium"]
  ROUTE -->|approved escalation| SOL["escalation.patch.yml<br/>OpenAI GPT-5.6 Sol / high"]

  subgraph TREE["Resulting Cordis plugin tree"]
    LOOP["agent loop"]
    PROMPT["system-prompt assembly"]
    LLM["llm-pi-ai adapter"]
    TOOLS["scoped tool registry"]
    SESSION["append-only session log"]
    POLICY["sandbox + approval policy"]
    SKILLS["project skill loader"]
  end

  LUNA --> TREE
  TERRA --> TREE
  SOL --> TREE
  LOOP --> PROMPT --> LLM
  LOOP --> TOOLS
  LOOP --> SESSION
  POLICY --> TOOLS
  SKILLS --> PROMPT
```

The selected profile contributes an ordered plugin tree. `dsh-base` supplies model adapters, the agent loop, session persistence, tools, credentials, sandboxing, approvals, and other services. `dsh-headless` adds the one-shot runner. Project `--patch` files target plugin rows by ID and replace their configuration; `npm run dsh:config` resolves and verifies every route without making a model call.

One agent **turn** contains zero or more **steps**. Each step is one model request followed by the tool calls it requests:

```mermaid
sequenceDiagram
  participant Runner as Outer SDD runner
  participant Agent as Harness agent loop
  participant Log as Durable session log
  participant OpenAI as OpenAI Responses API
  participant Tools as Guarded local tools
  participant Cost as Cost observer

  Runner->>Runner: validate specs + estimate budget
  Runner->>Agent: start isolated headless task
  Agent->>Log: turn/start + user/message
  Agent->>Agent: assemble prompt sections + tool schemas
  Agent->>OpenAI: llm/stream
  OpenAI-->>Agent: streamed response + provider usage
  Agent->>Log: assistant/message or assistant/attempt
  loop Requested tools
    Agent->>Tools: pre-execute -> execute -> post-execute
    Tools-->>Agent: tool/result
    Agent->>Log: persist call and result
  end
  Cost->>Log: fold disjoint usage for every attempt
  Cost-->>Runner: measured USD + budget decision
  Agent->>Log: step/end + turn/end
  Runner->>Runner: append cost ledger + report outcome
```

Session events are the durable source of model history: resume, fork, replay, transcript projection, and this repository's cost observer derive from the log. Live `agent/*`, `llm/stream`, and `tools/*` events are interception points for in-flight behavior. Capability seams separate a service definition, a provider, and consumers, which is why swapping the LLM adapter does not require parallel versions of the loop or tools.

## How this repository applies the architecture

The outer scripts are intentionally outside the model-controlled runtime and form a delivery control plane:

```mermaid
flowchart TD
  USER["Operator chooses change ID + spec IDs"] --> VALIDATE["Validate manifest, authority, dependencies, ledger, secrets"]
  SOURCES["Public JSON + SQLite URLs"] --> INGEST["Deterministic download, hash verification, private profiling"]
  INGEST --> PRIVATE["Ignored .sdd/inputs inventory"]
  VALIDATE --> PROMPT["Compact dependency-ordered prompt<br/>IMPLEMENT vs CONTEXT ONLY"]
  PROMPT --> RESERVE["Price four estimated attempts<br/>reserve run/change budget"]
  RESERVE --> DSH["Pinned DeepSeek Harness headless session"]
  PRIVATE -.->|"available only through documented local checks"| DSH
  DSH --> OPENAI["Allow-listed OpenAI model"]
  DSH --> WORKTREE["Workspace edits + deterministic tests"]
  DSH --> EVENTS["Ignored durable Harness JSONL events"]
  EVENTS --> METER["Normalize uncached/cache-read/cache-write/output usage"]
  METER --> GATE{"measured budget exceeded?"}
  GATE -->|yes| STOP["terminate + record unresolved/failed outcome"]
  GATE -->|no| SETTLE["append hash-chained cost settlement"]
  WORKTREE --> REVIEW["human review + npm run check"]
  SETTLE --> REVIEW
  REVIEW --> COMMIT["commit with Cost-Entry trailer"]
  COMMIT --> CI["offline GitHub release gates"]
```

The deterministic boundary is deliberate. Source downloading, hashing, schema profiling, dependency ordering, validation, pricing arithmetic, tests, and CI use no model. Harness and OpenAI are introduced only for bounded engineering work. The catalog application produced later must itself remain model-free.

### Boundaries and non-guarantees

The paper's guarantees are conditional, not magic cleanup:

- Only operations mediated through the context and supplied with correct inverses are automatically reverted. External emissions such as sent network data cannot generally be undone; they require withholding/commit protocols or application-level compensation.
- Declared dependency access resembles capability control, but untrusted code can bypass language-level objects. A real hostile-code boundary still needs a process, WebAssembly, container, or comparable external sandbox. This project uses Harness workspace confinement for a trusted coding agent; it does not claim arbitrary-code isolation.
- Dependency cycles do not resolve automatically; mutually dependent components remain inactive unless the design is decomposed or the cycle is rejected.
- Key identity alone does not solve independently versioned interface compatibility. Package/version discipline and compatibility tests remain necessary.
- The paper's Koishi case study is evidence of feasibility and adoption, not a controlled performance or productivity benchmark.

## Prerequisites

- Node.js `^22.19.0 || >=24.0.0`
- npm
- Python 3 with the standard `sqlite3` module (source inventory only)
- Git
- `OPENAI_API_KEY` only for a live agent run

## Bootstrap and verify

```bash
npm ci
npm run dsh:config
npm run sources:ingest
npm run check
npm run cost:report
```

`sources:ingest` downloads the public JSON and SQLite snapshots, verifies their pinned hashes, profiles them deterministically, and stores them only under ignored `.sdd/inputs`. CI stays offline and does not need an API key.

## Run the SDD agent

Start with a preparation-only run. It produces an ignored prompt and manifest, calls no model, and shows the dependency closure:

```bash
npm run sdd:prepare -- --change cli-input-implementation --spec SDD-001,SDD-002
```

After reviewing the selected specs, make `OPENAI_API_KEY` available in the shell without saving it in the repository, then run the same bounded task:

```bash
npm run sdd:run -- --change cli-input-implementation --spec SDD-001,SDD-002
```

Use `--route economy` for a deliberately low-cost mechanical change. The escalation route is intentionally noisy and requires both `--route escalation`, `--approve-escalation`, and `--escalation-reason "..."`.

The inner agent may edit and test the working tree. It may not commit, push, or read raw PDFs. The outer runner validates scope, isolates Harness state, monitors durable usage, writes an ignored run result, and appends a public cost record. Review its changes and proof before committing:

```bash
npm run check
npm run cost:report
git commit -m "Implement CLI and input contracts" -m "Cost-Entry: cli-input-implementation"
```

If the work was performed outside this Harness and its exact provider usage is unavailable, record that honestly rather than inventing zero:

```bash
npm run cost:record -- --change manual-review --spec SDD-001 --reason "External tool did not expose provider usage."
```

## Recommended implementation order

| Change | Specs to request | Outcome |
|---|---|---|
| 1 | `SDD-001,SDD-002` | TypeScript boundary, CLI contract, safe parsing |
| 2 | `SDD-003` | SQLite migrations and constraints |
| 3 | `SDD-004` | Deterministic canonical identity and alias data |
| 4 | `SDD-005,SDD-006` | Atomic consolidation, errors, security, observability |
| 5 | `SDD-007` | Complete automated and fixture verification |
| 6 | `SDD-008` | Public delivery and engineering defense |

These spec IDs are the prompts: the runner builds a compact instruction from the manifest and dependency graph, while the full behavior stays versioned in `docs/sdd/specs/`. Do not ask the agent to “build everything” in one context window.

## Model and cost policy

The default route is `openai/gpt-5.6-terra` at medium reasoning. Use `gpt-5.6-luna` for high-volume ingestion summaries, formatting, and mechanical test repair. `gpt-5.6-sol`, a request above 272,000 prompt tokens, or an unpriced model/tier requires an explicit policy change and review.

Pricing comes from the dated repository price book, not from a transitive adapter. Provider usage is normalized into disjoint uncached-input, cache-read, cache-write, and output buckets. Reasoning is included in output and is never counted twice. Since the pinned Harness adapter does not preserve the actual OpenAI service tier, known costs are marked `standard-assumed`; missing usage remains `unreconciled`, never zero.

The initial infrastructure change was authored in Codex outside the target Harness, whose exact token/currency usage was not exposed to this repository. Its ledger entry is therefore intentionally `unavailable`.

## Specification map

The canonical graph is `docs/sdd/manifest.json`; requirement authority and ownership are in `docs/sdd/traceability.json`. Start at `SDD-000`, which explicitly separates the user's workflow request, the assessment behavior, and fixture observations. Architectural choices are recorded in `docs/adr/`.

The source documents include a confidentiality notice. They are neither copied nor quoted in this public repository. Only paraphrased requirements, public URLs, hashes, and independently observed schema facts are retained.

## Release gate

A future product release requires:

1. all requested specs implemented and evidence-linked;
2. `npm run check` and the opt-in private-fixture suite passing from a clean clone;
3. source hashes and foreign-key invariants verified;
4. no PDFs, fixture bytes, databases, secrets, or Harness transcripts tracked;
5. a valid cost entry for every commit and `npm run cost:report` reviewed;
6. the final Git revision and CI result recorded in the delivery note.

See `docs/sdd/specs/08-delivery-and-engineering-defense.md` for the finished application runbook requirements; they are deliberately not fabricated before the application exists.
