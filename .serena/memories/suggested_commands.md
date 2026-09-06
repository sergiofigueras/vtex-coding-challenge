# Suggested commands

- Install: `npm ci`
- Verify all Harness routes without a key: `npm run dsh:config`
- Scaffold another project: `npm run project:create -- --id <project-id> --title "<title>"`
- Generic commands use `npm run project:<operation> -- --project <project-id>`.
- Download/hash/profile private fixtures: `npm run sources:ingest`
- Validate SDD, traceability, ledger, secrets, and tests: `npm run check`
- Prepare a model-free run: `npm run sdd:prepare -- --change <id> --spec <SDD-ID[,SDD-ID]>`
- Execute the default Terra run: `npm run sdd:run -- --change <id> --spec <ids>`
- Economy adds `--route economy`; Sol requires `--route escalation --approve-escalation --escalation-reason <reason>`.
- Report mapped cost across projects: `npm run cost:report`; filter with `npm run project:cost -- --project <project-id>`.
- Commit trailer: `Cost-Entry: <change-id>`.
