import { CriticVerdict, Finding, Plan, SubQuestion, SynthesizedAnswer } from "./types";

export interface ResearchAttempt {
  subQuestionId: string;
  attempt: number;
  verdict: CriticVerdict;
}

export interface OrchestratorEvents {
  "plan:start": [query: string];
  "plan:complete": [plan: Plan];
  "research:start": [subQuestion: SubQuestion];
  "research:attempt": [attempt: ResearchAttempt];
  "research:complete": [finding: Finding];
  "synthesize:start": [];
  "synthesize:complete": [answer: SynthesizedAnswer];
}
