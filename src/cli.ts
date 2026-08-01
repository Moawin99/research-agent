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
import { createDbLogger } from "./listeners/dbLogger";
import { createGrafanaBridge } from "./listeners/grafanaBridge";
import { startLocalServer } from "./server/localServer";
import { prisma } from "./db/client";
import { listHistory, showHistoryDetail } from "./history";

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
      case "api_call_completed":
        // No direct display action: spinners are already resolved via critic_verdict /
        // research_failed, the top-level catch in main() handles user-facing error text,
        // and api_call_completed is handled separately by createTokenSummaryListener.
        break;
    }
  };
}

interface AgentTokenTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// Independent Observer subscriber: aggregates api_call_completed events per agent and
// prints a token-usage summary once the run's final answer is ready. Has no knowledge
// of the orchestrator internals beyond the event stream, same as the other listeners.
function createTokenSummaryListener(): EventListener {
  const totals = new Map<string, AgentTokenTotals>();

  function printSummary(): void {
    if (totals.size === 0) return;

    console.log(chalk.bold.underline("Token usage (this run)"));
    const grand: AgentTokenTotals = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

    for (const [agent, t] of totals) {
      grand.calls += t.calls;
      grand.inputTokens += t.inputTokens;
      grand.outputTokens += t.outputTokens;
      grand.cacheReadTokens += t.cacheReadTokens;
      grand.cacheCreationTokens += t.cacheCreationTokens;

      const cacheNote =
        t.cacheReadTokens || t.cacheCreationTokens
          ? `, cache-read ${t.cacheReadTokens}, cache-write ${t.cacheCreationTokens}`
          : "";
      console.log(chalk.gray(`  ${agent}: ${t.calls} call(s) — in ${t.inputTokens}, out ${t.outputTokens}${cacheNote}`));
    }

    const grandCacheNote =
      grand.cacheReadTokens || grand.cacheCreationTokens
        ? `, cache-read ${grand.cacheReadTokens}, cache-write ${grand.cacheCreationTokens}`
        : "";
    console.log(
      chalk.cyan(
        `  Total: ${grand.calls} call(s) — in ${grand.inputTokens}, out ${grand.outputTokens}${grandCacheNote}`
      )
    );
    console.log("");
  }

  return (event: PipelineEvent) => {
    if (event.type === "api_call_completed") {
      const existing = totals.get(event.agent) ?? {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      };
      existing.calls += 1;
      existing.inputTokens += event.inputTokens;
      existing.outputTokens += event.outputTokens;
      existing.cacheReadTokens += event.cacheReadTokens ?? 0;
      existing.cacheCreationTokens += event.cacheCreationTokens ?? 0;
      totals.set(event.agent, existing);
    } else if (event.type === "synthesis_completed") {
      printSummary();
    }
  };
}

// The orchestrator is now a long-lived, per-process singleton (see main()) so the
// SSE endpoint and the Grafana bridge can hold a single stable subscription across
// every query in the session. Per-run listeners (display/file/db/token-summary) still
// need fresh state each run, so they subscribe and unsubscribe around each call here.
async function runOnce(query: string, orchestrator: SimpleOrchestrator): Promise<void> {
  const unsubscribeDisplay = orchestrator.events.subscribe(createDisplayListener());
  const unsubscribeFileLogger = orchestrator.events.subscribe(fileLogger); // comment out to prove the CLI display is unaffected
  const unsubscribeDbLogger = orchestrator.events.subscribe(createDbLogger());
  const unsubscribeTokenSummary = orchestrator.events.subscribe(createTokenSummaryListener());

  try {
    const answer = await orchestrator.run(query);
    printAnswer(answer);
  } finally {
    unsubscribeDisplay();
    unsubscribeFileLogger();
    unsubscribeDbLogger();
    unsubscribeTokenSummary();
  }
}

function printError(error: unknown): void {
  activeSpinner?.fail(chalk.red("Failed"));
  activeSpinner = undefined;

  console.error(chalk.red.bold("\nSomething went wrong:"));
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
}

async function main(): Promise<void> {
  const [, , command, arg] = process.argv;

  if (command === "history") {
    if (arg) {
      await showHistoryDetail(arg);
    } else {
      await listHistory();
    }
    await prisma.$disconnect();
    return;
  }

  process.on("SIGINT", () => {
    activeSpinner?.stop();
    console.log("\n" + chalk.gray("Cancelled."));
    process.exit(0);
  });

  const orchestrator = createOrchestrator();
  orchestrator.events.subscribe(createGrafanaBridge());
  startLocalServer(orchestrator);

  for (;;) {
    const query = await promptForQuery();
    if (query === undefined) break;

    console.log();
    try {
      await runOnce(query, orchestrator);
    } catch (error) {
      printError(error);
    }

    console.log();
    const again = await promptForAnother();
    if (!again) break;
    console.log();
  }

  console.log(chalk.gray("Goodbye."));
  await prisma.$disconnect();
  // The local Express server (started above) keeps a listening socket open, which
  // would otherwise keep the process alive indefinitely after the prompt loop ends.
  process.exit(0);
}

main();
