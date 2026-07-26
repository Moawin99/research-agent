export interface SubQuestion {
  id: string;
  text: string;
  sourceType: "web" | "docs" | "code";
  parentId?: string;
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

export interface Orchestrator {
  planner: PlannerAgent;
  researchers: Record<SubQuestion["sourceType"], ResearcherAgent>;
  run(query: string): Promise<Finding[]>;
}
