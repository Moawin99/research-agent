import { Finding, ResearcherAgent, SubQuestion } from "../types";

export const fakeResearcher: ResearcherAgent = {
  name: "fakeResearcher",
  async run(subQuestion: SubQuestion): Promise<Finding> {
    return {
      subQuestionId: subQuestion.id,
      content: `Fake finding for sub-question "${subQuestion.text}"`,
      sources: [
        {
          url: "https://example.com/fake-source",
          title: "Fake Source",
          snippet: "This is a placeholder snippet standing in for a real research result.",
        },
      ],
      confidence: "medium",
      verified: false,
    };
  },
};
