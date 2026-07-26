import Anthropic from "@anthropic-ai/sdk";
import { Finding, ResearcherAgent, Source, SubQuestion } from "../types";
import { FindingSchema } from "../schemas";

const client = new Anthropic();

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 2; // 1 retry

const SYSTEM_PROMPT = `You are a research assistant with access to a web search tool. Research the user's question using web search, then write a clear, well-supported answer grounded in what you found.

Keep your answer concise: a few short paragraphs at most (aim for under 300 words). Do not write an exhaustive report — this is one finding among several that will be combined later.

After your answer, you MUST end your response with a line in exactly this form, with nothing after it:
CONFIDENCE: <low|medium|high>

Rate confidence based on how directly and reliably the search results answered the question:
- high: authoritative sources directly and clearly answered the question
- medium: sources partially answered it, or there was some ambiguity or conflicting information
- low: search results were weak, tangential, or largely unhelpful

The CONFIDENCE line is mandatory and must be the last line of your response, no matter how long the answer is.`;

const CONFIDENCE_LINE_PATTERN = /^\s*CONFIDENCE:\s*(low|medium|high)\s*$/im;

async function createWithRetry(
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.messages.create(params, { timeout: REQUEST_TIMEOUT_MS });
    } catch (error) {
      lastError = error;
      console.error(`webResearcher: attempt ${attempt} failed:`, error);
    }
  }
  throw new Error(`webResearcher: API call failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}

export const webResearcher: ResearcherAgent = {
  name: "webResearcher",
  async run(subQuestion: SubQuestion): Promise<Finding> {
    const response = await createWithRetry({
      model: "claude-opus-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: subQuestion.text }],
    });

    if (response.stop_reason === "pause_turn") {
      console.warn(
        `webResearcher: response for "${subQuestion.id}" paused mid-search (iteration limit) — using partial content`
      );
    }

    const sourcesByUrl = new Map<string, Source>();
    const textParts: string[] = [];

    for (const block of response.content) {
      if (block.type !== "text") continue;
      textParts.push(block.text);

      for (const citation of block.citations ?? []) {
        if (citation.type !== "web_search_result_location") continue;
        if (!sourcesByUrl.has(citation.url)) {
          sourcesByUrl.set(citation.url, {
            url: citation.url,
            title: citation.title ?? "Untitled",
            snippet: citation.cited_text,
          });
        }
      }
    }

    // Fallback: if no citations came through, fall back to the raw search results.
    if (sourcesByUrl.size === 0) {
      for (const block of response.content) {
        if (block.type !== "web_search_tool_result") continue;
        if (!Array.isArray(block.content)) continue; // error object, not results
        for (const result of block.content) {
          if (!sourcesByUrl.has(result.url)) {
            sourcesByUrl.set(result.url, { url: result.url, title: result.title, snippet: "" });
          }
        }
      }
    }

    const fullText = textParts.join("\n").trim();
    const confidenceMatch = fullText.match(CONFIDENCE_LINE_PATTERN);
    if (!confidenceMatch) {
      console.warn(`webResearcher: no CONFIDENCE line found for "${subQuestion.id}" — defaulting to "low"`);
    }
    const confidence = (confidenceMatch?.[1].toLowerCase() as "low" | "medium" | "high" | undefined) ?? "low";
    const content = fullText.replace(CONFIDENCE_LINE_PATTERN, "").trim();

    const candidate = {
      subQuestionId: subQuestion.id,
      content,
      sources: Array.from(sourcesByUrl.values()),
      confidence,
      verified: false,
    };

    try {
      return FindingSchema.parse(candidate);
    } catch (error) {
      console.error("webResearcher: assembled Finding failed schema validation:", candidate);
      throw new Error(`webResearcher: assembled Finding failed schema validation: ${error}`);
    }
  },
};
