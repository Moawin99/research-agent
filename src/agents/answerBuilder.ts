import { AnswerSection, SynthesizedAnswer } from "../types";

export class AnswerBuilder {
  private sections: AnswerSection[] = [];
  private unresolved: string[] = [];

  addSection(section: AnswerSection): this {
    this.sections.push(section);
    return this;
  }

  addUnresolved(subQuestionId: string): this {
    this.unresolved.push(subQuestionId);
    return this;
  }

  build(originalQuery: string, summary: string): SynthesizedAnswer {
    return {
      originalQuery,
      sections: this.sections,
      summary,
      unresolvedQuestions: this.unresolved,
    };
  }
}
