import {
  CriticAgent,
  Finding,
  Orchestrator,
  Plan,
  PlannerAgent,
  ResearcherAgent,
  SubQuestion,
  SynthesizedAnswer,
  SynthesizerAgent,
} from "./types";
import { PipelineEventEmitter } from "./eventEmitter";

const MAX_RETRIES = 1;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SimpleOrchestrator implements Orchestrator {
  planner: PlannerAgent;
  researchers: Record<SubQuestion["sourceType"], ResearcherAgent>;
  critic: CriticAgent;
  synthesizer: SynthesizerAgent;
  events: PipelineEventEmitter;

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
    this.events = new PipelineEventEmitter();
  }

  async run(query: string): Promise<SynthesizedAnswer> {
    this.events.emit({ type: "plan_started", query });
    let plan: Plan;
    try {
      plan = await this.planner.run(query);
    } catch (error) {
      this.events.emit({ type: "pipeline_error", stage: "plan", error: errorMessage(error) });
      throw error;
    }
    this.events.emit({ type: "plan_completed", plan });

    const findings: Finding[] = [];
    for (const subQuestion of plan.subQuestions) {
      this.events.emit({ type: "research_started", subQuestion });
      const finding = await this.researchSubQuestion(subQuestion);
      findings.push(finding);
      this.events.emit({ type: "research_completed", finding });
    }

    this.events.emit({ type: "synthesis_started" });
    let answer: SynthesizedAnswer;
    try {
      answer = await this.synthesizer.run({ plan, findings });
    } catch (error) {
      this.events.emit({ type: "pipeline_error", stage: "synthesis", error: errorMessage(error) });
      throw error;
    }
    this.events.emit({ type: "synthesis_completed", answer });

    return answer;
  }

  private async researchSubQuestion(subQuestion: SubQuestion): Promise<Finding> {
    const researcher = this.researchers[subQuestion.sourceType];

    try {
      let finding = await researcher.run(subQuestion);
      let verdict = await this.critic.run({ subQuestion, finding });
      this.events.emit({ type: "critic_verdict", verdict, attempt: 1 });

      let retries = 0;
      while (!verdict.passed && retries < MAX_RETRIES) {
        retries++;
        const attempt = (retries + 1) as 1 | 2;
        this.events.emit({
          type: "retry_started",
          subQuestionId: subQuestion.id,
          feedback: verdict.feedback ?? "(no specific feedback provided)",
        });

        const retryInput: SubQuestion = { ...subQuestion, feedback: verdict.feedback };
        finding = await researcher.run(retryInput);
        verdict = await this.critic.run({ subQuestion, finding });
        this.events.emit({ type: "critic_verdict", verdict, attempt });
      }

      finding.verified = verdict.passed;
      return finding;
    } catch (error) {
      const message = errorMessage(error);
      this.events.emit({ type: "research_failed", subQuestionId: subQuestion.id, error: message });
      this.events.emit({ type: "pipeline_error", stage: "research", error: message });
      throw error;
    }
  }
}
