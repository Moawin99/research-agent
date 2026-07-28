import Anthropic from "@anthropic-ai/sdk";
import { Plan, PlannerAgent } from "../types";
import { PlanSchema } from "../schemas";
import { stripCodeFences } from "../utils";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a research planning agent. Given a user's query, break it into 2-5 focused sub-questions that together cover what's needed to answer the query well.

For each sub-question, assign a sourceType of "web", "docs", or "code" depending on what kind of source would best answer it. Default to "web" if unsure.

Return ONLY raw JSON matching this exact shape, with no markdown code fences and no preamble or explanation:
{"originalQuery": string, "subQuestions": [{"id": string, "text": string, "sourceType": "web"|"docs"|"code"}]}`;

export const realPlanner: PlannerAgent = {
  name: "realPlanner",
  async run(query: string): Promise<Plan> {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: query }],
    });

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
