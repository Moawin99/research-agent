import { Counter, Histogram, register } from "prom-client";

export { register };

export const pipelineRunsTotal = new Counter({
  name: "pipeline_runs_total",
  help: "Total number of research pipeline runs started",
});

export const researchRetriesTotal = new Counter({
  name: "research_retries_total",
  help: "Total number of Critic-triggered research retries",
});

export const pipelineRunDurationSeconds = new Histogram({
  name: "pipeline_run_duration_seconds",
  help: "Duration of a full pipeline run, from planning to synthesis completion, in seconds",
  buckets: [1, 2.5, 5, 10, 20, 40, 80, 160],
});

export const tokensUsedTotal = new Counter({
  name: "tokens_used_total",
  help: "Total tokens used per agent per token type",
  labelNames: ["agent", "type"] as const,
});

export const findingsVerifiedTotal = new Counter({
  name: "findings_verified_total",
  help: "Total findings that passed verification",
});

export const findingsUnresolvedTotal = new Counter({
  name: "findings_unresolved_total",
  help: "Total findings that never passed verification, even after retry",
});
