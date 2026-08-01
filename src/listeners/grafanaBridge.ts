import { EventListener, PipelineEvent } from "../events";
import {
  findingsUnresolvedTotal,
  findingsVerifiedTotal,
  pipelineRunDurationSeconds,
  pipelineRunsTotal,
  researchRetriesTotal,
  tokensUsedTotal,
} from "../metrics";

const LOKI_PUSH_URL = "http://localhost:3100/loki/api/v1/push";

function pushToLoki(event: PipelineEvent): void {
  const timestampNs = (BigInt(Date.now()) * 1_000_000n).toString();
  const body = {
    streams: [
      {
        stream: { job: "research-pipeline", event_type: event.type },
        values: [[timestampNs, JSON.stringify(event)]],
      },
    ],
  };

  fetch(LOKI_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((error) => {
    console.error("grafanaBridge: failed to push event to Loki:", error instanceof Error ? error.message : error);
  });
}

// Step 9's api_call_completed events carry free-form agent labels (e.g.
// "synthesizerAgent:section") — collapse those down to the fixed planner/researcher/
// critic/synthesizer categories the dashboard's tokens_used_total panel expects.
function agentCategory(agent: string): string {
  if (agent.startsWith("realPlanner")) return "planner";
  if (agent.startsWith("webResearcher")) return "researcher";
  if (agent.startsWith("criticAgent")) return "critic";
  if (agent.startsWith("synthesizerAgent")) return "synthesizer";
  return "other";
}

export function createGrafanaBridge(): EventListener {
  let runStartedAt: number | undefined;

  return (event: PipelineEvent) => {
    pushToLoki(event);

    switch (event.type) {
      case "plan_started":
        runStartedAt = Date.now();
        pipelineRunsTotal.inc();
        break;

      case "retry_started":
        researchRetriesTotal.inc();
        break;

      case "api_call_completed": {
        const agent = agentCategory(event.agent);
        tokensUsedTotal.inc({ agent, type: "input" }, event.inputTokens);
        tokensUsedTotal.inc({ agent, type: "output" }, event.outputTokens);
        if (event.cacheReadTokens) {
          tokensUsedTotal.inc({ agent, type: "cache_read" }, event.cacheReadTokens);
        }
        break;
      }

      case "synthesis_completed":
        if (runStartedAt !== undefined) {
          pipelineRunDurationSeconds.observe((Date.now() - runStartedAt) / 1000);
          runStartedAt = undefined;
        }
        findingsVerifiedTotal.inc(event.answer.sections.length);
        findingsUnresolvedTotal.inc(event.answer.unresolvedQuestions.length);
        break;

      default:
        break;
    }
  };
}
