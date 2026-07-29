import {
  CriticAgent,
  Finding,
  Orchestrator,
  PlannerAgent,
  ResearcherAgent,
  SubQuestion,
  SynthesizedAnswer,
  SynthesizerAgent,
} from "./types";

const MAX_RETRIES = 1;

export class SimpleOrchestrator implements Orchestrator {
  planner: PlannerAgent;
  researchers: Record<SubQuestion["sourceType"], ResearcherAgent>;
  critic: CriticAgent;
  synthesizer: SynthesizerAgent;

  constructor(
    planner: PlannerAgent,
    researchers: Record<SubQuestion["sourceType"], ResearcherAgent>,
    critic: CriticAgent,
    synthesizer: SynthesizerAgent
  ) {
    this.planner = planner;
    this.researchers = researchers;
    this.critic = critic;
    this.synthesizer = synthesizer;
  }

  async run(query: string): Promise<SynthesizedAnswer> {
    const plan = await this.planner.run(query);

    console.log("=== PLAN ===");
    console.log(`Original query: ${plan.originalQuery}`);
    for (const subQuestion of plan.subQuestions) {
      console.log(`  [${subQuestion.id}] (${subQuestion.sourceType}) ${subQuestion.text}`);
    }

    console.log("\n=== RESEARCHING ===");
    const findings: Finding[] = [];
    for (const subQuestion of plan.subQuestions) {
      console.log(`\n--- [${subQuestion.id}] (${subQuestion.sourceType}) ---`);
      const finding = await this.researchSubQuestion(subQuestion);
      findings.push(finding);
    }

    console.log("\n=== SYNTHESIZING ===");
    return this.synthesizer.run({ plan, findings });
  }

  private async researchSubQuestion(subQuestion: SubQuestion): Promise<Finding> {
    const researcher = this.researchers[subQuestion.sourceType];

    let finding = await researcher.run(subQuestion);
    let verdict = await this.critic.run({ subQuestion, finding });
    this.logVerdict(subQuestion.id, 1, verdict);

    let retries = 0;
    while (!verdict.passed && retries < MAX_RETRIES) {
      retries++;
      const retryInput: SubQuestion = { ...subQuestion, feedback: verdict.feedback };
      finding = await researcher.run(retryInput);
      verdict = await this.critic.run({ subQuestion, finding });
      this.logVerdict(subQuestion.id, retries + 1, verdict);
    }

    finding.verified = verdict.passed;
    return finding;
  }

  private logVerdict(subQuestionId: string, attempt: number, verdict: { passed: boolean; feedback?: string }): void {
    const feedbackSuffix = verdict.feedback ? ` feedback="${verdict.feedback}"` : "";
    console.log(`  [critic] [${subQuestionId}] attempt ${attempt}: passed=${verdict.passed}${feedbackSuffix}`);
  }
}
