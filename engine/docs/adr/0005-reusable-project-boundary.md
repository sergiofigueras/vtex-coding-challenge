# ADR 0005: Separate the delivery engine from project workspaces

Status: accepted — 2026-09-06

## Decision

Keep shared DeepSeek Harness configuration, OpenAI policy and pricing, runners, validators, skills, tests, infrastructure specifications, and the append-only cost ledger under `engine/`. Keep every deliverable's descriptor, instructions, sources, product specifications, decisions, runtime state, and application code under `projects/<project-id>/`.

All project-scoped commands require an explicit validated ID. Harness runs with that project's directory as its working and filesystem-sandbox root. The engine skill is injected through Harness's bundled-skill directory instead of being copied into every project.

## Consequences

One engine can develop multiple projects with independent specifications and private runtime state. Product agents cannot accidentally edit shared engine code through ordinary Harness tools. Engine upgrades and price-book changes remain centralized and separately reviewable. The root package is only a workspace launcher and compatibility layer; it is not another copy of the engine.

The cost ledger remains global to preserve one hash chain and commit-trailer authority, but every new entry identifies its project. The two pre-separation historical entries remain unscoped and unchanged.
