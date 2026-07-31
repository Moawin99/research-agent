import chalk from "chalk";
import { prisma } from "./db/client";
import { printAnswer } from "./display";
import { SynthesizedAnswer } from "./types";

const HISTORY_LIMIT = 10;
const SUMMARY_PREVIEW_LENGTH = 100;

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() + "…" : text;
}

export async function listHistory(): Promise<void> {
  const runs = await prisma.researchRun.findMany({
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  if (runs.length === 0) {
    console.log(chalk.gray("No past runs yet."));
    return;
  }

  console.log(chalk.bold.underline(`Last ${runs.length} research run(s)`));
  for (const run of runs) {
    const date = run.createdAt.toISOString().slice(0, 16).replace("T", " ");
    console.log(
      chalk.gray(`[${date}] (${run.id})`) +
        " " +
        chalk.cyan(run.query) +
        chalk.gray(" → ") +
        chalk.white(truncate(run.summary, SUMMARY_PREVIEW_LENGTH))
    );
  }
}

export async function showHistoryDetail(id: string): Promise<void> {
  const run = await prisma.researchRun.findUnique({ where: { id } });

  if (!run) {
    console.log(chalk.red(`No run found with id "${id}".`));
    return;
  }

  const answer = JSON.parse(run.answer) as SynthesizedAnswer;
  console.log(chalk.gray(`Run from ${run.createdAt.toISOString()} (${run.id})`));
  printAnswer(answer);
}
