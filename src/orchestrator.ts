import {
  ApiUsage,
  CriticAgent,
  CriticVerdict,
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
import { mergeSimilarSubQuestions } from "./utils";

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

  private reportUsage = (agent: string, usage: ApiUsage): void => {
    this.events.emit({ type: "api_call_completed", agent, ...usage });
  };

  async run(query: string): Promise<SynthesizedAnswer> {
    this.events.emit({ type: "plan_started", query });
    let plan: Plan;
    try {
      plan = await this.planner.run(query, this.reportUsage);
    } catch (error) {
      this.events.emit({ type: "pipeline_error", stage: "plan", error: errorMessage(error) });
      throw error;
    }
    plan = mergeSimilarSubQuestions(plan);
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
      answer = await this.synthesizer.run({ plan, findings }, this.reportUsage);
    } catch (error) {
      this.events.emit({ type: "pipeline_error", stage: "synthesis", error: errorMessage(error) });
      throw error;
    }
    this.events.emit({ type: "synthesis_completed", answer });

    return answer;
  }

  // High-confidence findings skip the Critic call entirely and are marked verified
  // directly. This is a deliberate precision/cost tradeoff (see README "Cost tradeoffs"):
  // it trusts the Researcher's self-reported confidence instead of independently
  // verifying it, cutting a full Critic API call for the common case where the
  // Researcher already found a clear, well-supported answer.
  private async evaluateFinding(subQuestion: SubQuestion, finding: Finding, attempt: 1 | 2): Promise<CriticVerdict> {
    if (finding.confidence === "high") {
      const verdict: CriticVerdict = { subQuestionId: subQuestion.id, passed: true };
      this.events.emit({ type: "critic_verdict", verdict, attempt });
      return verdict;
    }

    const verdict = await this.critic.run({ subQuestion, finding }, this.reportUsage);
    this.events.emit({ type: "critic_verdict", verdict, attempt });
    return verdict;
  }

  private async researchSubQuestion(subQuestion: SubQuestion): Promise<Finding> {
    const researcher = this.researchers[subQuestion.sourceType];

    try {
      let finding = await researcher.run(subQuestion, this.reportUsage);
      let verdict = await this.evaluateFinding(subQuestion, finding, 1);

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
        finding = await researcher.run(retryInput, this.reportUsage);
        verdict = await this.evaluateFinding(subQuestion, finding, attempt);
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
