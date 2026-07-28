import Anthropic from "@anthropic-ai/sdk";
import { CriticAgent, CriticVerdict, Finding, SubQuestion } from "../types";
import { CriticVerdictSchema } from "../schemas";
import { stripCodeFences } from "../utils";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a critical reviewer for a research pipeline. You are given a sub-question and a finding produced by a researcher. Judge whether the finding is acceptable:

1. Does the finding directly and substantively answer the sub-question (not vague, not evasive, not off-topic)?
2. Is the finding reasonably supported by its listed sources (not fabricated or wildly overreaching)?

Return ONLY raw JSON matching this exact shape, no markdown fences, no preamble:
{"subQuestionId": string, "passed": boolean, "feedback": string | null}

If passed is false, "feedback" must be a specific, actionable note describing what's missing or wrong so a researcher can fix it on a retry. If passed is true, "feedback" must be null.`;

function formatUserMessage(subQuestion: SubQuestion, finding: Finding): string {
  const sourceList = finding.sources.length
    ? finding.sources.map((s) => `- ${s.title} (${s.url ?? "no url"}): ${s.snippet}`).join("\n")
    : "(no sources provided)";

  return `Sub-question ID: ${subQuestion.id}
Sub-question: ${subQuestion.text}

Finding content:
${finding.content}

Finding sources:
${sourceList}

Finding self-reported confidence: ${finding.confidence}`;
}

export const criticAgent: CriticAgent = {
  name: "criticAgent",
  async run({ subQuestion, finding }): Promise<CriticVerdict> {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: formatUserMessage(subQuestion, finding) }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const cleanedText = stripCodeFences(rawText);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleanedText);
    } catch (error) {
      console.error("criticAgent: returned non-JSON output:", rawText);
      throw new Error(`criticAgent: failed to parse model output as JSON: ${error}`);
    }

    // Model is instructed to send `feedback: null` when passed — normalize to
    // "absent" so it matches the schema's `.optional()` (not `.nullable()`).
    if (parsedJson && typeof parsedJson === "object" && "feedback" in parsedJson) {
      const candidate = parsedJson as { feedback?: unknown };
      if (candidate.feedback === null) {
        delete candidate.feedback;
      }
    }

    try {
      return CriticVerdictSchema.parse(parsedJson);
    } catch (error) {
      console.error("criticAgent: output failed schema validation:", rawText);
      throw new Error(`criticAgent: model output failed schema validation: ${error}`);
    }
  },
};
