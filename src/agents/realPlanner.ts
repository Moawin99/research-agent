import Anthropic from "@anthropic-ai/sdk";
import { ApiUsageReporter, Plan, PlannerAgent } from "../types";
import { PlanSchema } from "../schemas";
import { stripCodeFences, toApiUsage } from "../utils";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a research planning agent. Given a user's query, break it into the minimum number of focused sub-questions (1-5) that together fully cover what's needed to answer the query well. Use 1-2 for narrow or single-fact queries; reserve 3-5 for genuinely broad or multi-part queries. Do not pad the plan with extra sub-questions just to reach a higher count.

For each sub-question, assign a sourceType of "web", "docs", or "code" depending on what kind of source would best answer it. Default to "web" if unsure.

Return ONLY raw JSON matching this exact shape, with no markdown code fences and no preamble or explanation:
{"originalQuery": string, "subQuestions": [{"id": string, "text": string, "sourceType": "web"|"docs"|"code"}]}`;

export const realPlanner: PlannerAgent = {
  name: "realPlanner",
  async run(query: string, reportUsage?: ApiUsageReporter): Promise<Plan> {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: query }],
    });

    reportUsage?.("realPlanner", toApiUsage(response.usage));

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const cleanedText = stripCodeFences(rawText);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleanedText);
    } catch (error) {
      console.error("Planner returned non-JSON output:", rawText);
      throw new Error(`realPlanner: failed to parse model output as JSON: ${error}`);
    }

    try {
      return PlanSchema.parse(parsedJson);
    } catch (error) {
      console.error("Planner output failed schema validation:", rawText);
      throw new Error(`realPlanner: model output failed schema validation: ${error}`);
    }
  },
};
