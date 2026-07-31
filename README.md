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
