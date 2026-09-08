# Conventions

- Implement only specs explicitly marked IMPLEMENT in the generated prompt; dependencies are context-only.
- Keep user, assessment, process, assumption, and fixture-observation authority separate.
- Product identity is a conservative versioned canonical tuple; opaque seller IDs are scoped by seller; ambiguity aborts.
- Parameterized SQL and one atomic SQLite transaction are mandatory for future product work.
- Never rewrite prior `engine/cost/ledger.jsonl` bytes. New entries identify their project; missing external/provider usage is unavailable or unreconciled, never zero.
- Shared engine code stays under `engine/`; project requirements and application code stay under `projects/<project-id>/`.
- Reasoning tokens are included in OpenAI output; do not double charge. Long-context pricing applies per request above 272000 prompt tokens.
- Use Serena/targeted inspection and deterministic tests to minimize model context and cost.
