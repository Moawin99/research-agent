import { EventEmitter } from "node:events";
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
import { OrchestratorEvents } from "./events";

const MAX_RETRIES = 1;

export class SimpleOrchestrator extends EventEmitter<OrchestratorEvents> implements Orchestrator {
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
    super();
    this.planner = planner;
    this.researchers = researchers;
    this.critic = critic;
    this.synthesizer = synthesizer;
  }

  async run(query: string): Promise<SynthesizedAnswer> {
    this.emit("plan:start", query);
    const plan = await this.planner.run(query);
    this.emit("plan:complete", plan);

    const findings: Finding[] = [];
    for (const subQuestion of plan.subQuestions) {
      this.emit("research:start", subQuestion);
      const finding = await this.researchSubQuestion(subQuestion);
      findings.push(finding);
      this.emit("research:complete", finding);
    }

    this.emit("synthesize:start");
    const answer = await this.synthesizer.run({ plan, findings });
    this.emit("synthesize:complete", answer);

    return answer;
  }

  private async researchSubQuestion(subQuestion: SubQuestion): Promise<Finding> {
    const researcher = this.researchers[subQuestion.sourceType];

    let finding = await researcher.run(subQuestion);
    let verdict = await this.critic.run({ subQuestion, finding });
    this.emit("research:attempt", { subQuestionId: subQuestion.id, attempt: 1, verdict });

    let retries = 0;
    while (!verdict.passed && retries < MAX_RETRIES) {
      retries++;
      const retryInput: SubQuestion = { ...subQuestion, feedback: verdict.feedback };
      finding = await researcher.run(retryInput);
      verdict = await this.critic.run({ subQuestion, finding });
      this.emit("research:attempt", { subQuestionId: subQuestion.id, attempt: retries + 1, verdict });
    }

    finding.verified = verdict.passed;
    return finding;
  }
}
