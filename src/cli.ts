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
import { EventListener, PipelineEvent } from "./events";
import { fileLogger } from "./listeners/fileLogger";

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

// Pure display logic driven entirely by the event stream — this listener has
// no idea how the pipeline runs internally, only what events it emits.
function createDisplayListener(): EventListener {
  const researchSpinners = new Map<string, Ora>();

  return (event: PipelineEvent) => {
    switch (event.type) {
      case "plan_started":
        activeSpinner = ora(chalk.cyan("Planning research...")).start();
        break;

      case "plan_completed":
        activeSpinner?.succeed(chalk.cyan(`Plan ready — ${event.plan.subQuestions.length} sub-question(s)`));
        activeSpinner = undefined;
        for (const subQuestion of event.plan.subQuestions) {
          console.log(chalk.gray(`   [${subQuestion.id}] (${subQuestion.sourceType}) ${subQuestion.text}`));
        }
        break;

      case "research_started": {
        const spinner = ora(
          chalk.cyan(`Researching [${event.subQuestion.id}]: ${event.subQuestion.text}`)
        ).start();
        researchSpinners.set(event.subQuestion.id, spinner);
        activeSpinner = spinner;
        break;
      }

      case "critic_verdict": {
        const subQuestionId = event.verdict.subQuestionId;
        const spinner = researchSpinners.get(subQuestionId);
        if (!spinner) break;

        if (event.verdict.passed && event.attempt === 1) {
          spinner.succeed(chalk.green(`[${subQuestionId}] verified — passed on first attempt`));
          researchSpinners.delete(subQuestionId);
        } else if (event.verdict.passed) {
          spinner.succeed(chalk.yellow(`[${subQuestionId}] verified — passed after retry`));
          researchSpinners.delete(subQuestionId);
        } else if (event.attempt === 2) {
          spinner.fail(chalk.red(`[${subQuestionId}] unresolved — still failing after retry`));
          researchSpinners.delete(subQuestionId);
        }
        // attempt 1 && !passed: leave the spinner running — "retry_started" updates its text next.
        break;
      }

      case "retry_started": {
        const spinner = researchSpinners.get(event.subQuestionId);
        if (spinner) {
          spinner.text = chalk.yellow(`[${event.subQuestionId}] failed review — retrying with feedback...`);
        }
        break;
      }

      case "research_failed": {
        const spinner = researchSpinners.get(event.subQuestionId);
        spinner?.fail(chalk.red(`[${event.subQuestionId}] research failed: ${event.error}`));
        researchSpinners.delete(event.subQuestionId);
        break;
      }

      case "synthesis_started":
        activeSpinner = ora(chalk.cyan("Synthesizing final answer...")).start();
        break;

      case "synthesis_completed":
        activeSpinner?.succeed(chalk.cyan("Final answer ready"));
        activeSpinner = undefined;
        break;

      case "research_completed":
      case "pipeline_error":
        // No direct display action: spinners are already resolved via critic_verdict /
        // research_failed, and the top-level catch in main() handles user-facing error text.
        break;
    }
  };
}

async function runOnce(query: string): Promise<void> {
  const orchestrator = createOrchestrator();
  orchestrator.events.subscribe(createDisplayListener());
  orchestrator.events.subscribe(fileLogger); // comment out to prove the CLI display is unaffected

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
