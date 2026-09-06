# Project core

- Infrastructure/specification repository; the catalog application is intentionally not implemented yet.
- DeepSeek Harness orchestrates; every model route uses OpenAI. Product runtime must remain deterministic and model-free.
- Canonical SDD graph: `docs/sdd/manifest.json`; authority ledger: `docs/sdd/traceability.json`.
- Read model/runtime details in `mem:tech_stack`, implementation constraints in `mem:conventions`, commands in `mem:suggested_commands`, and completion gates in `mem:task_completion`.
- Raw PDFs, downloaded fixtures, databases, credentials, and `.sdd/` runtime state are never committed.