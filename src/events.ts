import { CriticVerdict, Finding, Plan, SubQuestion, SynthesizedAnswer } from "./types";

export type PipelineEvent =
  | { type: "plan_started"; query: string }
  | { type: "plan_completed"; plan: Plan }
  | { type: "research_started"; subQuestion: SubQuestion }
  | { type: "research_completed"; finding: Finding }
  | { type: "research_failed"; subQuestionId: string; error: string }
  | { type: "critic_verdict"; verdict: CriticVerdict; attempt: 1 | 2 }
  | { type: "retry_started"; subQuestionId: string; feedback: string }
  | { type: "synthesis_started" }
  | { type: "synthesis_completed"; answer: SynthesizedAnswer }
  | { type: "pipeline_error"; stage: string; error: string };

export type EventListener = (event: PipelineEvent) => void;
