import "dotenv/config";
import { realPlanner } from "./agents/realPlanner";
import { fakeResearcher } from "./agents/fakeResearcher";
import { SimpleOrchestrator } from "./orchestrator";
import { Finding, Plan } from "./types";

const TEST_QUERIES = [
  "compare event sourcing vs. CRUD for a fintech app",
  "what's the healthiest way to train for a marathon as a beginner",
  "how did the fall of the Roman Empire affect medieval trade routes",
];

function printPlan(plan: Plan): void {
  console.log("=== PLAN ===");
  console.log(`Original query: ${plan.originalQuery}`);
  for (const subQuestion of plan.subQuestions) {
    console.log(`  [${subQuestion.id}] (${subQuestion.sourceType}) ${subQuestion.text}`);
  }
}

function printFindings(findings: Finding[]): void {
  console.log("\n=== FINDINGS ===");
  for (const finding of findings) {
    console.log(`  [${finding.subQuestionId}] confidence=${finding.confidence} verified=${finding.verified}`);
    console.log(`    content: ${finding.content}`);
    for (const source of finding.sources) {
      console.log(`    source: ${source.title} (${source.url ?? "no url"}) — ${source.snippet}`);
    }
  }
}

async function main() {
  const orchestrator = new SimpleOrchestrator(realPlanner, {
    web: fakeResearcher,
    docs: fakeResearcher,
    code: fakeResearcher,
  });

  for (const query of TEST_QUERIES) {
    console.log(`\n\n########## QUERY: ${query} ##########`);

    const plan = await orchestrator.planner.run(query);
    printPlan(plan);

    const findings: Finding[] = [];
    for (const subQuestion of plan.subQuestions) {
      const researcher = orchestrator.researchers[subQuestion.sourceType];
      findings.push(await researcher.run(subQuestion));
    }
    printFindings(findings);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
