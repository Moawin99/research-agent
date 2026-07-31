import { prisma } from "./client";
import { Finding, Plan, SynthesizedAnswer } from "../types";

export async function persistRun(
  plan: Plan,
  findings: Finding[],
  answer: SynthesizedAnswer,
  attemptsBySubQuestionId: Map<string, number> = new Map()
): Promise<string> {
  const findingsById = new Map(findings.map((f) => [f.subQuestionId, f]));

  const run = await prisma.researchRun.create({
    data: {
      query: plan.originalQuery,
      summary: answer.summary,
      answer: JSON.stringify(answer),
      subQuestions: {
        create: plan.subQuestions.map((subQuestion) => {
          const finding = findingsById.get(subQuestion.id);
          return {
            text: subQuestion.text,
            sourceType: subQuestion.sourceType,
            findingContent: finding?.content ?? null,
            confidence: finding?.confidence ?? null,
            verified: finding?.verified ?? false,
            attempts: attemptsBySubQuestionId.get(subQuestion.id) ?? 1,
            sources: JSON.stringify(finding?.sources ?? []),
          };
        }),
      },
    },
  });

  return run.id;
}
