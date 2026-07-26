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
