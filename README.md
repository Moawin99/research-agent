# research-agent

## Setup

```
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY; DATABASE_URL already defaults to file:./dev.db
npx prisma migrate dev
npm start
```

`dev.db` (the local SQLite database) is git-ignored and created by the migration — each clone of this repo needs to run `npx prisma migrate dev` once before its first `npm start`.

## Commands

- `npm start` — interactive research CLI
- `npm start -- history` — list the last 10 past research runs
- `npm start -- history <id>` — show one past run's full result

## Local observability (SSE + Grafana/Loki/Prometheus)

`npm start` also boots a small local Express server (port `3001`, same process as the
CLI) exposing the pipeline's Observer event stream live:

- `GET http://localhost:3001/events/stream` — raw pipeline events as Server-Sent
  Events (`curl -N http://localhost:3001/events/stream` to tail them)
- `GET http://localhost:3001/metrics` — Prometheus scrape target

To see this as real dashboards instead of raw JSON:

```
docker compose up -d   # starts Loki, Prometheus, and Grafana with datasources
                        # auto-provisioned from observability/ — no manual setup
npm start               # starts the CLI + the local SSE/metrics server
```

Run a query in the CLI, then open `http://localhost:3000` (anonymous access is
enabled for local use) and import `observability/dashboard.json`
(**Dashboards → New → Import**) to get panels for runs over time, token usage by
agent, retry rate, verified vs. unresolved findings, run duration distribution, and a
live event log filterable by event type. The dashboard's Prometheus/Loki references
are template variables (`${DS_PROMETHEUS}` / `${DS_LOKI}`), so the import wizard will
prompt you to pick the provisioned datasources — this is the same portable format
Grafana produces via **Share → Export → Export for sharing externally**.

This is a local-only setup — no deployment, auth, or public URL involved anywhere.

## Cost tradeoffs

Each run prints a per-agent token usage summary (input/output/cache tokens) so the
cost of a run is measurable, not guessed at. A few deliberate cost-vs-quality tradeoffs
worth calling out explicitly rather than leaving as silent behavior:

- **High-confidence findings skip the Critic call.** If the Researcher self-reports
  `confidence: "high"` for a finding, the Critic's independent review is skipped
  entirely and the finding is marked verified directly (see
  `Orchestrator.evaluateFinding` in `src/orchestrator.ts`). This trades a small amount
  of verification precision (an occasional bad "high confidence" self-report goes
  unverified) for a meaningfully lower per-run cost, since the Critic is otherwise
  called for every finding and again on every retry.
- **The Planner is instructed to use the minimum sub-questions needed**, not the
  maximum allowed (1-2 for narrow queries, up to 5 only for genuinely broad ones).
  Fewer sub-questions means fewer Researcher + Critic calls — this is the single
  biggest lever, since each sub-question is a full call chain, not just a few tokens.
- **Near-duplicate sub-questions are merged** before research begins (simple
  word-overlap similarity on normalized text, not real semantic clustering — see
  `mergeSimilarSubQuestions` in `src/utils.ts`). This only catches near-identical
  rewordings the Planner occasionally emits, by design.
- **Prompt caching** (`cache_control: { type: "ephemeral" }`) is applied to every
  agent's static system prompt, since Researcher and Critic are called multiple times
  per run with identical instructions each time.
