# Project core

- Multi-project workspace: shared control plane under `engine/`, independent deliverables under `projects/<project-id>/`; the catalog application is intentionally not implemented yet.
- DeepSeek Harness orchestrates; every model route uses OpenAI. The catalog runtime must remain deterministic and model-free.
- Engine SDD graph: `engine/docs/sdd/`; catalog graph and authority ledger: `projects/catalog-consolidation/docs/sdd/`.
- Read model/runtime details in `mem:tech_stack`, implementation constraints in `mem:conventions`, commands in `mem:suggested_commands`, and completion gates in `mem:task_completion`.
- Raw PDFs, downloaded fixtures, databases, credentials, and per-project `.sdd/` runtime state are never committed.
