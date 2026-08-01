# Multi-Agent Research Assistant

A multi-agent pipeline that takes a research question, decomposes it into sub-questions, researches each one via web search, verifies the findings, and synthesizes a final cited answer — with a full local observability stack for watching the agents work.

## Why build this?

The day I learned about microservices I learned how elegant a solution can look like. Seperating services not only to increase uptime but allows for massive scaling. Seeing multi-agent solutions gave me that same excitement. This project is a simple use case of how multiple agents can be used to break down a larger problem.

## What it does

Give it a question — e.g. *"compare the tradeoffs of event sourcing vs. CRUD for a fintech app"* — and instead of a single LLM call answering off the cuff, it:

1. **Plans** — breaks the question into 2–5 focused sub-questions
2. **Researches** — dispatches each sub-question to a web-search-enabled agent
3. **Verifies** — a Critic agent checks each finding, with one retry allowed for weak answers
4. **Synthesizes** — merges verified findings into a final answer with inline citations

It works on any research topic, not just engineering questions — the pipeline shape is topic-agnostic.

## Architecture & design patterns

This project is intentionally built without an agent framework (no LangChain, etc.) — everything talks to the Anthropic API directly, so the orchestration logic is fully visible rather than hidden behind a library.

| Pattern | Where it's used | Why |
|---|---|---|
| **Strategy** | `ResearcherAgent` interface — web/docs/code researchers are interchangeable implementations behind one contract | Swap or add a new research source without touching the orchestrator |
| **Chain of Responsibility** | Critic → Researcher retry loop | A finding can be bounced back for one retry with feedback, with a hard depth cap to prevent runaway loops |
| **Builder** | `AnswerBuilder` in the Synthesizer | Assembles the final answer incrementally as verified sections come in, rather than one blind LLM call producing everything at once |
| **Observer** | `PipelineEventEmitter` on the `Orchestrator` | The pipeline emits a typed event stream; the CLI display, file logger, SQLite persistence, SSE endpoint, and Grafana bridge are all independent subscribers. The orchestrator has no knowledge of any of them. |
| **Template Method** (shared agent skeleton) | `Agent<TInput, TOutput>` base contract | Every agent (Planner, Researcher, Critic, Synthesizer) follows the same call → validate → retry-on-failure shape |

### Data flow

```
query → Planner → Plan (sub-questions)
              ↓
      Researcher(s) → Finding[]
              ↓
      Critic (+ 1 retry max) → verified Finding[]
              ↓
      Synthesizer → SynthesizedAnswer
              ↓
      Observer event stream → [CLI display | file log | SQLite | SSE | Grafana]
```

## Validation strategy

Every LLM call that needs structured output is validated with `zod` schemas matching the TypeScript interfaces exactly (`Plan`, `Finding`, `CriticVerdict`, `SynthesizedAnswer`). Malformed model output fails loudly with the raw response logged, rather than silently propagating bad data downstream.

## Persistence & observability

- **SQLite (via Prisma)** — local run history, browsable with `npm start -- history`
- **SSE endpoint** (`/events/stream`) — live raw event tail, framework-agnostic
- **Grafana + Loki + Prometheus** (local via Docker Compose) — dashboards for token usage per agent, retry rate, run duration, and verified/unresolved ratio, plus a searchable live event log

All of the above are added purely as new Observer subscribers — none of them required changes to the orchestrator or any agent.

## Cost/token optimization

- Adaptive sub-question count (Planner is instructed to use the minimum needed, not default to the max)
- Prompt caching on static system prompts across repeated agent calls
- Per-agent `max_tokens` ceilings sized to what each agent actually needs
- Optional Critic short-circuit for high-confidence findings (documented tradeoff, not a silent behavior change)
- Per-run token/call counter surfaced through the Observer stream

## Getting started

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npx prisma migrate dev --name init
npm start
```

To bring up the observability stack:

```bash
docker compose up
# Grafana: http://localhost:3000
```

## Bugs faced & resolutions

> Fill in with what actually came up during implementation — a few prompts based on the trickier parts of this build:

- **LLM output not matching the expected JSON shape** — how often did this happen, and did trimming/tightening the system prompt fix it, or did you need retry logic around the parse step itself?
- **Critic retry loop** — did the single-retry cap ever feel too strict or too loose in practice?
- **SQLite vs. deployment** — if you explored deployment at all, did the ephemeral-filesystem issue with SQLite come up as expected?
- **Prometheus scrape target / `host.docker.internal`** — this is a common source of local networking friction on Linux vs. Mac/Windows — did you hit it?
- **Web search tool result parsing** — separating `text` vs. search-result content blocks from the API response is fiddly; any surprises there?
- **Rate limits / retries on the Anthropic API itself** — did you add any backoff, or was it a non-issue at this scale?

## What's not built (possible updates)

- Public deployment (AWS plan exists but wasn't implemented — kept local-only by choice)
- Authentication on the SSE endpoint or Grafana instance
- Multi-user support / accounts
- CI/CD pipeline
