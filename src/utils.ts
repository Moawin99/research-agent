import type Anthropic from "@anthropic-ai/sdk";
import { ApiUsage, Plan, SubQuestion } from "./types";

export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export function toApiUsage(usage: Anthropic.Usage): ApiUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? undefined,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? undefined,
  };
}

function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function wordOverlap(a: string, b: string): number {
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersectionSize = [...setA].filter((word) => setB.has(word)).length;
  const unionSize = new Set([...setA, ...setB]).size;
  return intersectionSize / unionSize;
}

const DUPLICATE_SIMILARITY_THRESHOLD = 0.7;

// Cheap string-similarity merge: collapses near-duplicate sub-questions the Planner
// sometimes emits so they don't each trigger a full Researcher + Critic call. This is
// a stretch-goal simplification (word-overlap on normalized text), not real semantic
// clustering — it only catches near-identical rewordings, by design.
export function mergeSimilarSubQuestions(plan: Plan): Plan {
  const kept: SubQuestion[] = [];
  for (const subQuestion of plan.subQuestions) {
    const normalized = normalizeForDedup(subQuestion.text);
    const isDuplicate = kept.some(
      (existing) => wordOverlap(normalizeForDedup(existing.text), normalized) >= DUPLICATE_SIMILARITY_THRESHOLD
    );
    if (!isDuplicate) kept.push(subQuestion);
  }
  return kept.length === plan.subQuestions.length ? plan : { ...plan, subQuestions: kept };
}
