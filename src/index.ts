import "dotenv/config";
import { realPlanner } from "./agents/realPlanner";
import { fakeResearcher } from "./agents/fakeResearcher";
import { webResearcher } from "./agents/webResearcher";
import { SimpleOrchestrator } from "./orchestrator";
import { Finding, Plan } from "./types";

const TEST_QUERIES = [
  "compare event sourcing vs. CRUD for a fintech app",
  "what's the healthiest way to train for a marathon as a beginner",
];

function printPlan(plan: Plan): void {
  console.log("=== PLAN ===");
  console.log(`Original query: ${plan.originalQuery}`);
  for (const subQuestion of plan.subQuestions) {
    console.log(`  [${subQuestion.id}] (${subQuestion.sourceType}) ${subQuestion.text}`);
  }
}

function printFinding(finding: Finding): void {
  console.log(`  [${finding.subQuestionId}] confidence=${finding.confidence} verified=${finding.verified}`);
  console.log(`    content: ${finding.content}`);
  for (const source of finding.sources) {
    console.log(`    source: ${source.title} (${source.url ?? "no url"}) — ${source.snippet}`);
  }
}

async function main() {
  const orchestrator = new SimpleOrchestrator(realPlanner, {
    web: webResearcher,
    docs: fakeResearcher,
    code: fakeResearcher,
  });

  for (const query of TEST_QUERIES) {
    console.log(`\n\n########## QUERY: ${query} ##########`);

    const plan = await orchestrator.planner.run(query);
    printPlan(plan);

    console.log("\n=== FINDINGS ===");
    for (const subQuestion of plan.subQuestions) {
      console.log(`\n--- researching [${subQuestion.id}] (${subQuestion.sourceType}) ---`);
      const researcher = orchestrator.researchers[subQuestion.sourceType];
      const finding = await researcher.run(subQuestion);
      printFinding(finding);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
