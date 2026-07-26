import { fakePlanner } from "./agents/fakePlanner";
import { fakeResearcher } from "./agents/fakeResearcher";
import { SimpleOrchestrator } from "./orchestrator";

async function main() {
  const query = "compare event sourcing vs. CRUD for a fintech app";

  const orchestrator = new SimpleOrchestrator(fakePlanner, {
    web: fakeResearcher,
    docs: fakeResearcher,
    code: fakeResearcher,
  });

  const plan = await orchestrator.planner.run(query);
  console.log("=== PLAN ===");
  console.log(`Original query: ${plan.originalQuery}`);
  for (const subQuestion of plan.subQuestions) {
    console.log(`  [${subQuestion.id}] (${subQuestion.sourceType}) ${subQuestion.text}`);
  }

  const findings = await orchestrator.run(query);
  console.log("\n=== FINDINGS ===");
  for (const finding of findings) {
    console.log(`  [${finding.subQuestionId}] confidence=${finding.confidence} verified=${finding.verified}`);
    console.log(`    content: ${finding.content}`);
    for (const source of finding.sources) {
      console.log(`    source: ${source.title} (${source.url ?? "no url"}) — ${source.snippet}`);
    }
  }
}

main();
