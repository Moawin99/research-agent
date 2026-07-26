import { Finding, Orchestrator, PlannerAgent, ResearcherAgent, SubQuestion } from "./types";

export class SimpleOrchestrator implements Orchestrator {
  planner: PlannerAgent;
  researchers: Record<SubQuestion["sourceType"], ResearcherAgent>;

  constructor(
    planner: PlannerAgent,
    researchers: Record<SubQuestion["sourceType"], ResearcherAgent>
  ) {
    this.planner = planner;
    this.researchers = researchers;
  }

  async run(query: string): Promise<Finding[]> {
    const plan = await this.planner.run(query);

    const findings: Finding[] = [];
    for (const subQuestion of plan.subQuestions) {
      const researcher = this.researchers[subQuestion.sourceType];
      const finding = await researcher.run(subQuestion);
      findings.push(finding);
    }

    return findings;
  }
}
