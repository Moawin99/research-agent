import { EventListener, PipelineEvent } from "../events";
import { Finding, Plan } from "../types";
import { persistRun } from "../db/persistRun";

export function createDbLogger(): EventListener {
  let plan: Plan | undefined;
  const findings: Finding[] = [];
  const attemptsBySubQuestionId = new Map<string, number>();

  return (event: PipelineEvent) => {
    switch (event.type) {
      case "plan_completed":
        plan = event.plan;
        break;

      case "research_completed":
        findings.push(event.finding);
        break;

      case "critic_verdict": {
        const subQuestionId = event.verdict.subQuestionId;
        const current = attemptsBySubQuestionId.get(subQuestionId) ?? 0;
        attemptsBySubQuestionId.set(subQuestionId, Math.max(current, event.attempt));
        break;
      }

      case "synthesis_completed":
        if (!plan) {
          console.error("dbLogger: synthesis_completed fired before plan_completed — skipping persistence");
          break;
        }
        persistRun(plan, findings, event.answer, attemptsBySubQuestionId).catch((error) => {
          console.error("dbLogger: failed to persist run:", error);
        });
        break;

      default:
        break;
    }
  };
}
