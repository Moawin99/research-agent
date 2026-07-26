import { z } from "zod";

export const SubQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceType: z.enum(["web", "docs", "code"]),
  parentId: z.string().optional(),
});

export const PlanSchema = z.object({
  originalQuery: z.string(),
  subQuestions: z.array(SubQuestionSchema).min(1).max(5),
});

export const SourceSchema = z.object({
  url: z.string().optional(),
  title: z.string(),
  snippet: z.string(),
});

export const FindingSchema = z.object({
  subQuestionId: z.string(),
  content: z.string(),
  sources: z.array(SourceSchema),
  confidence: z.enum(["low", "medium", "high"]),
  verified: z.boolean(),
});
