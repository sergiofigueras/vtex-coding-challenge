# Catalog RAG evidence index

The specifications are currently `ready`; implementation evidence is intentionally absent. Each SDD run must add one row per acceptance criterion only after executing the cited proof.

| Acceptance criterion | Status | Reproducible command or artifact |
|---|---|---|
| AC-000-01 through AC-008-05 | pending | Produced by the corresponding bounded `project:run`; do not mark implemented or verified without executable evidence. |

Global gates required after every coherent slice:

```bash
npm run project:validate -- --project catalog-rag --working-tree
npm --prefix projects/catalog-rag run check
npm run check
git diff --check
npm run project:cost -- --project catalog-rag
```

Private databases, runtime logs, provider responses, browser traces, and generated run prompts stay under ignored `.sdd/` state. Public evidence may contain bounded counts, hashes, metric summaries, and stable error codes but no source rows, user queries, prompts, credentials, vectors, or absolute local paths.
