import Anthropic from "@anthropic-ai/sdk";
import {
  AnswerSection,
  ApiUsageReporter,
  Finding,
  Plan,
  SubQuestion,
  SynthesizedAnswer,
  SynthesizerAgent,
} from "../types";
import { SynthesizedAnswerSchema } from "../schemas";
import { stripCodeFences, toApiUsage } from "../utils";
import { AnswerBuilder } from "./answerBuilder";

const client = new Anthropic();

const SECTION_SYSTEM_PROMPT = `You are a synthesis agent assembling a final research report. Given one research finding and its sources, produce a single report section.

Write a short heading (a few words, no trailing punctuation) and a clean paragraph of content that answers the sub-question, citing sources inline where you draw on them using the format "(Source: <source title>)".

Keep the content concise: one tight paragraph, under 150 words. This is one section among several in a larger report — do not write an exhaustive essay, and do not cite every source in the list, only the ones the content actually draws on.

Return ONLY raw JSON, no markdown fences, no preamble, in this exact shape:
{"heading": string, "content": string}

The JSON must be complete and syntactically valid — do not let the content run so long that the JSON gets cut off.`;

const SUMMARY_SYSTEM_PROMPT = `You are a synthesis agent writing the closing summary of a research report. Given the original query and the report's sections (heading + content for each), write a short summary (2-4 sentences) that ties the sections back to the original query.

Return ONLY the summary text itself — no JSON, no markdown fences, no preamble, no heading.`;

function formatSectionUserMessage(subQuestion: SubQuestion, finding: Finding): string {
  const sourceList = finding.sources.length
    ? finding.sources.map((s) => `- ${s.title} (${s.url ?? "no url"})`).join("\n")
    : "(no sources)";

  return `Sub-question: ${subQuestion.text}

Finding:
${finding.content}

Available sources (cite by title):
${sourceList}`;
}

async function buildSection(
  subQuestion: SubQuestion,
  finding: Finding,
  reportUsage?: ApiUsageReporter
): Promise<AnswerSection> {
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1536,
    system: [{ type: "text", text: SECTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: formatSectionUserMessage(subQuestion, finding) }],
  });

  reportUsage?.("synthesizerAgent:section", toApiUsage(response.usage));

  const textBlock = response.content.find((block) => block.type === "text");
  const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const cleanedText = stripCodeFences(rawText);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleanedText);
  } catch (error) {
    console.error(`synthesizerAgent: section for "${subQuestion.id}" returned non-JSON output:`, rawText);
    throw new Error(`synthesizerAgent: failed to parse section JSON for "${subQuestion.id}": ${error}`);
  }

  const { heading, content } = parsedJson as { heading?: unknown; content?: unknown };
  if (typeof heading !== "string" || typeof content !== "string") {
    console.error(`synthesizerAgent: section for "${subQuestion.id}" missing heading/content:`, parsedJson);
    throw new Error(`synthesizerAgent: section JSON for "${subQuestion.id}" missing heading or content`);
  }

  return {
    subQuestionId: subQuestion.id,
    heading,
    content,
    citedSources: finding.sources,
  };
}

async function buildSummary(
  originalQuery: string,
  sections: AnswerSection[],
  reportUsage?: ApiUsageReporter
): Promise<string> {
  const sectionList = sections.length
    ? sections.map((s) => `## ${s.heading}\n${s.content}`).join("\n\n")
    : "(no sections were produced — no findings passed verification)";

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    system: [{ type: "text", text: SUMMARY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Original query: ${originalQuery}\n\nReport sections:\n${sectionList}` }],
  });

  reportUsage?.("synthesizerAgent:summary", toApiUsage(response.usage));

  const textBlock = response.content.find((block) => block.type === "text");
  const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";
  return rawText.trim();
}

export const synthesizerAgent: SynthesizerAgent = {
  name: "synthesizerAgent",
  async run(
    { plan, findings }: { plan: Plan; findings: Finding[] },
    reportUsage?: ApiUsageReporter
  ): Promise<SynthesizedAnswer> {
    const findingsById = new Map(findings.map((f) => [f.subQuestionId, f]));
    const builder = new AnswerBuilder();
    const sections: AnswerSection[] = [];

    for (const subQuestion of plan.subQuestions) {
      const finding = findingsById.get(subQuestion.id);

      if (!finding || !finding.verified) {
        builder.addUnresolved(subQuestion.id);
        continue;
      }

      const section = await buildSection(subQuestion, finding, reportUsage);
      builder.addSection(section);
      sections.push(section);
    }

    const summary = await buildSummary(plan.originalQuery, sections, reportUsage);
    const candidate = builder.build(plan.originalQuery, summary);

    try {
      return SynthesizedAnswerSchema.parse(candidate);
    } catch (error) {
      console.error("synthesizerAgent: assembled answer failed schema validation:", candidate);
      throw new Error(`synthesizerAgent: assembled answer failed schema validation: ${error}`);
    }
  },
};
