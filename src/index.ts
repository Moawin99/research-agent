import "dotenv/config";
import { realPlanner } from "./agents/realPlanner";
import { fakeResearcher } from "./agents/fakeResearcher";
import { webResearcher } from "./agents/webResearcher";
import { criticAgent } from "./agents/criticAgent";
import { SimpleOrchestrator } from "./orchestrator";
import { Finding } from "./types";

const TEST_QUERIES = ["What design patterns are used most in strongly typed languages?"];

function printFinding(finding: Finding): void {
  console.log(`  [${finding.subQuestionId}] confidence=${finding.confidence} verified=${finding.verified}`);
  console.log(`    content: ${finding.content}`);
  for (const source of finding.sources) {
    console.log(`    source: ${source.title} (${source.url ?? "no url"}) — ${source.snippet}`);
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
    criticAgent
  );

  for (const query of TEST_QUERIES) {
    console.log(`\n\n########## QUERY: ${query} ##########`);

    const findings = await orchestrator.run(query);

    console.log("\n=== FINDINGS ===");
    for (const finding of findings) {
      console.log();
      printFinding(finding);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
