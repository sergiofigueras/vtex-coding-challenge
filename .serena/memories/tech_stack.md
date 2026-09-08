# Tech stack

- Node `^22.19.0 || >=24.0.0`, ESM JavaScript infrastructure, npm lockfile.
- `@deepseek-ai/dsh@0.1.2-rc.1` exact; shared patches under `engine/config/dsh/`.
- OpenAI route only: Luna economy, Terra medium default, Sol approved escalation.
- Python 3 standard `sqlite3` is used only for deterministic source inventory.
- GitHub Actions uses Node 24; no provider secret or live model call in CI.
- Price calculations use integer USD nanodollars from the immutable dated engine price book.
