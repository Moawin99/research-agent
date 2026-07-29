import "dotenv/config";
import chalk from "chalk";
import ora, { Ora } from "ora";
import prompts from "prompts";
import { realPlanner } from "./agents/realPlanner";
import { fakeResearcher } from "./agents/fakeResearcher";
import { webResearcher } from "./agents/webResearcher";
import { criticAgent } from "./agents/criticAgent";
import { synthesizerAgent } from "./agents/synthesizerAgent";
import { SimpleOrchestrator } from "./orchestrator";
import { printAnswer } from "./display";
import { Plan, SubQuestion } from "./types";
import { ResearchAttempt } from "./events";

let activeSpinner: Ora | undefined;

async function promptForQuery(): Promise<string | undefined> {
  const response = await prompts(
    {
      type: "text",
      name: "query",
      message: "What would you like to research?",
      validate: (value: string) => (value.trim().length > 0 ? true : "Please enter a question."),
    },
    { onCancel: () => false }
  );

  return typeof response.query === "string" ? response.query.trim() : undefined;
}

async function promptForAnother(): Promise<boolean> {
  const response = await prompts(
    {
      type: "confirm",
      name: "again",
      message: "Research another question?",
      initial: false,
    },
    { onCancel: () => false }
  );

  return response.again === true;
}

function createOrchestrator(): SimpleOrchestrator {
  return new SimpleOrchestrator(
    realPlanner,
    {
      web: webResearcher,
      docs: fakeResearcher,
      code: fakeResearcher,
    },
    criticAgent,
    synthesizerAgent
  );
}

function wireDisplay(orchestrator: SimpleOrchestrator): void {
  const researchSpinners = new Map<string, Ora>();

  orchestrator.on("plan:start", () => {
    activeSpinner = ora(chalk.cyan("Planning research...")).start();
  });

  orchestrator.on("plan:complete", (plan: Plan) => {
    activeSpinner?.succeed(chalk.cyan(`Plan ready — ${plan.subQuestions.length} sub-question(s)`));
    activeSpinner = undefined;
    for (const subQuestion of plan.subQuestions) {
      console.log(chalk.gray(`   [${subQuestion.id}] (${subQuestion.sourceType}) ${subQuestion.text}`));
    }
  });

  orchestrator.on("research:start", (subQuestion: SubQuestion) => {
    const spinner = ora(chalk.cyan(`Researching [${subQuestion.id}]: ${subQuestion.text}`)).start();
    researchSpinners.set(subQuestion.id, spinner);
    activeSpinner = spinner;
  });

  orchestrator.on("research:attempt", ({ subQuestionId, attempt, verdict }: ResearchAttempt) => {
    const spinner = researchSpinners.get(subQuestionId);
    if (!spinner) return;

    if (verdict.passed && attempt === 1) {
      spinner.succeed(chalk.green(`[${subQuestionId}] verified — passed on first attempt`));
      researchSpinners.delete(subQuestionId);
    } else if (verdict.passed) {
      spinner.succeed(chalk.yellow(`[${subQuestionId}] verified — passed after retry`));
      researchSpinners.delete(subQuestionId);
    } else if (attempt === 1) {
      spinner.text = chalk.yellow(`[${subQuestionId}] failed review — retrying with feedback...`);
    } else {
      spinner.fail(chalk.red(`[${subQuestionId}] unresolved — still failing after retry`));
      researchSpinners.delete(subQuestionId);
    }
  });

  orchestrator.on("synthesize:start", () => {
    activeSpinner = ora(chalk.cyan("Synthesizing final answer...")).start();
  });

  orchestrator.on("synthesize:complete", () => {
    activeSpinner?.succeed(chalk.cyan("Final answer ready"));
    activeSpinner = undefined;
  });
}

async function runOnce(query: string): Promise<void> {
  const orchestrator = createOrchestrator();
  wireDisplay(orchestrator);

  const answer = await orchestrator.run(query);
  printAnswer(answer);
}

function printError(error: unknown): void {
  activeSpinner?.fail(chalk.red("Failed"));
  activeSpinner = undefined;

  console.error(chalk.red.bold("\nSomething went wrong:"));
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
}

async function main(): Promise<void> {
  process.on("SIGINT", () => {
    activeSpinner?.stop();
    console.log("\n" + chalk.gray("Cancelled."));
    process.exit(0);
  });

  // infinite loop
  for (;;) {
    const query = await promptForQuery();
    if (query === undefined) break;

    console.log();
    try {
      await runOnce(query);
    } catch (error) {
      printError(error);
    }

    console.log();
    const again = await promptForAnother();
    if (!again) break;
    console.log();
  }

  console.log(chalk.gray("Goodbye."));
}

main();
