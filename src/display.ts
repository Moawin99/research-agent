import chalk from "chalk";
import { SynthesizedAnswer } from "./types";

export function printAnswer(answer: SynthesizedAnswer): void {
  console.log("\n" + chalk.bold.underline("Research Summary"));
  console.log(chalk.white(answer.summary) + "\n");

  answer.sections.forEach((section, i) => {
    console.log(chalk.bold.cyan(`${i + 1}. ${section.heading}`));
    console.log(chalk.white(section.content));
    if (section.citedSources.length > 0) {
      console.log(chalk.gray("   Sources: " + section.citedSources.map((s) => s.title).join(", ")));
    }
    console.log("");
  });

  if (answer.unresolvedQuestions.length > 0) {
    console.log(chalk.yellow.bold("Unresolved:"));
    answer.unresolvedQuestions.forEach((id) => console.log(chalk.yellow(`  - ${id}`)));
  }
}
