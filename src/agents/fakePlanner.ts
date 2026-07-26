import { Plan, PlannerAgent, SubQuestion } from "../types";

export const fakePlanner: PlannerAgent = {
  name: "fakePlanner",
  async run(query: string): Promise<Plan> {
    const subQuestions: SubQuestion[] = [
      {
        id: "sq-1",
        text: `What are the core tradeoffs of "${query}"?`,
        sourceType: "web",
      },
      {
        id: "sq-2",
        text: `What do official docs/specs say about "${query}"?`,
        sourceType: "docs",
      },
      {
        id: "sq-3",
        text: `What do real code examples show about "${query}"?`,
        sourceType: "code",
      },
    ];

    return {
      originalQuery: query,
      subQuestions,
    };
  },
};
