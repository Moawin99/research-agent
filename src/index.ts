import "dotenv/config";
import { realPlanner } from "./agents/realPlanner";
import { fakeResearcher } from "./agents/fakeResearcher";
import { webResearcher } from "./agents/webResearcher";
import { criticAgent } from "./agents/criticAgent";
import { synthesizerAgent } from "./agents/synthesizerAgent";
import { SimpleOrchestrator } from "./orchestrator";
import { SynthesizedAnswer } from "./types";

const TEST_QUERIES = ["What design patterns are used most in strongly typed languages?"];

function printAnswer(answer: SynthesizedAnswer): void {
  console.log("=== SUMMARY ===");
  console.log(answer.summary);

  console.log("\n=== SECTIONS ===");
  for (const section of answer.sections) {
    console.log(`\n## ${section.heading} [${section.subQuestionId}]`);
    console.log(section.content);
    if (section.citedSources.length) {
      console.log("Sources:");
      for (const source of section.citedSources) {
        console.log(`  - ${source.title} (${source.url ?? "no url"})`);
      }
    }
  }

  if (answer.unresolvedQuestions.length) {
    console.log("\n=== UNRESOLVED QUESTIONS ===");
    for (const id of answer.unresolvedQuestions) {
      console.log(`  - ${id}`);
    }
  } else {
    console.log("\n=== UNRESOLVED QUESTIONS ===");
    console.log("  (none)");
  }
}

async function main() {
  const orchestrator = new SimpleOrchestrator(
    realPlanner,
    {
      web: webResearcher,
      docs: fakeResearcher,
      code: fakeResearcher,
    },
    criticAgent,
    synthesizerAgent
  );

  for (const query of TEST_QUERIES) {
    console.log(`\n\n########## QUERY: ${query} ##########`);

    const answer = await orchestrator.run(query);

    console.log();
    printAnswer(answer);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
