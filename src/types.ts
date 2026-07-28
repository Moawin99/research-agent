export interface SubQuestion {
  id: string;
  text: string;
  sourceType: "web" | "docs" | "code";
  parentId?: string;
  feedback?: string;
}

export interface Plan {
  originalQuery: string;
  subQuestions: SubQuestion[];
}

export interface Source {
  url?: string;
  title: string;
  snippet: string;
}

export interface Finding {
  subQuestionId: string;
  content: string;
  sources: Source[];
  confidence: "low" | "medium" | "high";
  verified: boolean;
}

export interface Agent<TInput, TOutput> {
  name: string;
  run(input: TInput): Promise<TOutput>;
}

export type PlannerAgent = Agent<string, Plan>;
export type ResearcherAgent = Agent<SubQuestion, Finding>;

export interface CriticVerdict {
  subQuestionId: string;
  passed: boolean;
  feedback?: string; // present when passed = false, tells the researcher what to improve
}

export type CriticAgent = Agent<{ subQuestion: SubQuestion; finding: Finding }, CriticVerdict>;

export interface Orchestrator {
  planner: PlannerAgent;
  researchers: Record<SubQuestion["sourceType"], ResearcherAgent>;
  critic: CriticAgent;
  run(query: string): Promise<Finding[]>;
}
