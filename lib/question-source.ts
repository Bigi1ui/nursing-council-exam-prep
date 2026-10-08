export type ExamQuestion = {
  id: number;
  course: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  source: string;
};

export function parseSourceQuestions(rawText: string): ExamQuestion[] {
  return rawText.split(/(?=^\s*\d+\.\s)/m).flatMap((block) => {
    const lines = block.replace(/\uFFFD/g, "").split(/\r?\n/);
    const heading = lines[0]?.match(/^\s*(\d+)\.\s*(.*)$/);
    if (!heading) return [];

    const firstOption = lines.findIndex((line) => /^\s*[A-D]\.\s*/i.test(line));
    const answerMatch = block.match(/\bANSWER\s*:?\s*([A-D])\b/i);
    if (firstOption < 0 || !answerMatch) return [];

    const prompt = [heading[2], ...lines.slice(1, firstOption)]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const options = lines
      .slice(firstOption)
      .filter((line) => /^\s*[A-D]\.\s*/i.test(line))
      .map((line) => line.replace(/^\s*[A-D]\.\s*/i, "").trim());
    const answer = answerMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (!prompt || options.length < 2 || answer >= options.length) return [];

    const course = /health talk|health education/i.test(prompt)
      ? "Health Education"
      : /learn|teach|education|evaluation|classroom/i.test(prompt)
        ? "Nursing Education"
        : "Principles of Management";

    return [{
      id: Number(heading[1]),
      course,
      prompt,
      options,
      answer,
      explanation: `The supplied source identifies option ${answerMatch[1].toUpperCase()} as the answer. Review the topic in your course notes for the supporting rationale.`,
      source: "Principles of Management and Teaching",
    }];
  });
}