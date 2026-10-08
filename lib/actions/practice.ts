"use server";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseSourceQuestions } from "@/lib/question-source";

export type PracticeCourse = { id: string; name: string; slug: string };
export type PracticeSettings = {
  count: number;
  courseId: string | null;
  questionSet: "all" | "random" | "weak" | "mistakes" | "bookmarks";
  timeLimitSeconds: number | null;
};
export type PracticeSessionQuestion = {
  id: string;
  prompt: string;
  options: string[];
  sourceQuestionNumber: number;
  courseName: string;
  sourceTitle: string;
  sourceYear: number | null;
};
export type SavedPracticeAnswer = {
  selectedOption: number | null;
  isCorrect: boolean | null;
  markedForReview: boolean;
  correctOption?: number | null;
  explanation?: string | null;
};
export type PracticeSessionData = {
  id: string;
  questionCount: number;
  questionSet: PracticeSettings["questionSet"];
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt: string | null;
  timeLimitSeconds: number | null;
  questions: PracticeSessionQuestion[];
  answers: Record<string, SavedPracticeAnswer>;
};
export type StudentPracticeSummary = {
  questionsAnswered: number;
  correctAnswers: number;
  accuracy: number | null;
  practiceSessions: number;
  completedSessions: number;
  studyStreak: StudentStudyStreak;
  coursePerformance: { courseName: string; answered: number; correct: number; accuracy: number }[];
  recentSessions: { id: string; questionCount: number; questionSet: string; status: string; startedAt: string }[];
};
export type StudentStudyStreak = { currentStreak: number; longestStreak: number; lastStudyDate: string | null };
type StudentStudyStreakRow = { current_streak: number; longest_streak: number; last_study_date: string | null };
export type StudentBookmark = {
  questionId: string;
  prompt: string;
  courseName: string;
  sourceTitle: string;
  sourceYear: number | null;
  createdAt: string;
};
export type StudentMistake = {
  questionId: string;
  prompt: string;
  options: string[];
  selectedOption: number | null;
  correctOption: number;
  explanation: string | null;
  courseName: string;
  sourceTitle: string;
  sourceYear: number | null;
  attemptedAt: string;
};
type StudentMistakeRow = {
  question_id: string;
  prompt: string;
  options: string[];
  selected_option: number | null;
  correct_option: number;
  explanation: string | null;
  course_name: string;
  source_title: string;
  source_year: number | null;
  attempted_at: string;
};
type AdminQuestionRow = {
  id: string;
  prompt: string;
  options: string[];
  correct_option: number;
  course_name: string;
  source_title: string;
  source_year: number | null;
  review_status: string;
  question_type: string;
  source_question_number: number;
};

export type AdminQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctOption: number;
  courseName: string;
  sourceTitle: string;
  sourceYear: number | null;
  reviewStatus: string;
  questionType: string;
  sourceQuestionNumber: number;
};

export async function getStudentPracticeSummary(): Promise<{ summary?: StudentPracticeSummary; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to view your progress." };

  const supabase = await createClient();
  const [answersResult, sessionsResult, completedResult, streakResult] = await Promise.all([
    supabase
      .from("student_answers")
      .select("selected_option,is_correct,questions(courses(name)),practice_sessions!inner(question_set,status)")
      .not("selected_option", "is", null),
    supabase
      .from("practice_sessions")
      .select("id,question_count,question_set,status,started_at", { count: "exact" })
      .eq("student_id", auth.userId)
      .order("started_at", { ascending: false }),
    supabase
      .from("practice_sessions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", auth.userId)
      .eq("status", "completed"),
    supabase.rpc("get_my_study_streak"),
  ]);

  const error = answersResult.error ?? sessionsResult.error ?? completedResult.error ?? streakResult.error;
  if (error) return { error: `Could not load study statistics: ${error.message}` };

  const courseTotals = new Map<string, { answered: number; correct: number }>();
  const practiceAnswers = (answersResult.data ?? []).filter((answer) => {
    const sessionRelation = Array.isArray(answer.practice_sessions) ? answer.practice_sessions[0] : answer.practice_sessions;
    return sessionRelation?.status === "completed";
  });

  for (const answer of practiceAnswers) {
    const questionRelation = Array.isArray(answer.questions) ? answer.questions[0] : answer.questions;
    const courseRelation = Array.isArray(questionRelation?.courses) ? questionRelation.courses[0] : questionRelation?.courses;
    const courseName = courseRelation?.name ?? "Other nursing questions";
    const totals = courseTotals.get(courseName) ?? { answered: 0, correct: 0 };
    totals.answered += 1;
    if (answer.is_correct) totals.correct += 1;
    courseTotals.set(courseName, totals);
  }

  const questionsAnswered = practiceAnswers.length;
  const correctAnswers = practiceAnswers.filter((answer) => answer.is_correct).length;
  const streakRow = ((streakResult.data ?? []) as StudentStudyStreakRow[])[0];
  const sessions = sessionsResult.data ?? [];
  return {
    summary: {
      questionsAnswered,
      correctAnswers,
      accuracy: questionsAnswered ? Math.round((correctAnswers / questionsAnswered) * 100) : null,
      practiceSessions: sessionsResult.count ?? 0,
      completedSessions: completedResult.count ?? 0,
      studyStreak: {
        currentStreak: streakRow?.current_streak ?? 0,
        longestStreak: streakRow?.longest_streak ?? 0,
        lastStudyDate: streakRow?.last_study_date ?? null,
      },
      coursePerformance: [...courseTotals.entries()]
        .map(([courseName, totals]) => ({
          courseName,
          ...totals,
          accuracy: Math.round((totals.correct / totals.answered) * 100),
        }))
        .sort((a, b) => b.answered - a.answered),
      recentSessions: sessions.slice(0, 5).map((session) => ({
        id: session.id,
        questionCount: session.question_count,
        questionSet: session.question_set,
        status: session.status,
        startedAt: session.started_at,
      })),
    },
  };
}

export async function getPracticeSetupData() {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to start practice." };

  const supabase = await createClient();
  const [coursesResult, questionsResult] = await Promise.all([
    supabase.from("courses").select("id,name,slug").eq("is_active", true).order("name"),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("review_status", "approved"),
  ]);

  if (coursesResult.error || questionsResult.error) {
    const error = coursesResult.error ?? questionsResult.error;
    return { error: `Question practice is not set up yet: ${error?.message ?? "unknown database error"}` };
  }

  return { courses: (coursesResult.data ?? []) as PracticeCourse[], questionCount: questionsResult.count ?? 0 };
}

type ParsedQuestionDocumentCandidate = {
  prompt: string;
  options: string[];
  correctOption: number;
  explanation?: string;
  courseName?: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDocumentText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function guessCourseFromText(rawText: string) {
  const text = rawText.toLowerCase();
  if (/management|leadership|planning|administration|organizing|coordination/.test(text)) return "Principles of Management";
  if (/education|teaching|learning|curriculum|health education|nursing education/.test(text)) return "Nursing Education";
  if (/community|midwifery|obstetric|pediatrics|surgery|psychi|medical|nursing/.test(text)) return "General Nursing";
  return "General Nursing";
}

function extractSourceTitle(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Uploaded past questions";
}

async function extractPdfText(pdfBuffer: Buffer) {
  const pdfData = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
  const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
  const operationNames = new Map(Object.entries(pdfjs.OPS).map(([name, code]) => [code, name]));
  const extractGlyphText = (value: unknown): string => {
    if (Array.isArray(value)) return value.map(extractGlyphText).join("");
    if (value && typeof value === "object" && "unicode" in value) return String(value.unicode ?? "");
    return "";
  };
  let text = "";

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const operatorList = await page.getOperatorList();
    let fillColor = "#000000";
    let textMatrix: ArrayLike<number> | null = null;
    const redOptionPositions: { x: number; y: number }[] = [];

    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      const operationName = operationNames.get(operatorList.fnArray[index]);
      const args = operatorList.argsArray[index];

      if (operationName === "setFillRGBColor") {
        fillColor = String(args?.[0] ?? "");
        continue;
      }
      if (operationName === "setTextMatrix") {
        textMatrix = args?.[0] as ArrayLike<number> | null;
        continue;
      }
      if ((operationName !== "showText" && operationName !== "showSpacedText") || !textMatrix) continue;

      const color = fillColor.match(/^#([0-9a-f]{6})$/i)?.[1];
      if (!color) continue;
      const red = Number.parseInt(color.slice(0, 2), 16);
      const green = Number.parseInt(color.slice(2, 4), 16);
      const blue = Number.parseInt(color.slice(4, 6), 16);
      if (red < 150 || red < green * 1.5 || red < blue * 1.5 || green > 140) continue;

      const shownText = extractGlyphText(args?.[0]).trim();
      if (/^[A-E]\s*[.)]$/i.test(shownText)) {
        redOptionPositions.push({ x: textMatrix[4], y: textMatrix[5] });
      }
    }

    const lines: { y: number; items: { text: string; x: number; correct: boolean }[] }[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let line = lines.find((candidate) => Math.abs(candidate.y - y) < 0.8);
      if (!line) {
        line = { y, items: [] };
        lines.push(line);
      }

      const isOptionLabel = /^[A-E]\s*[.)]$/i.test(item.str.trim());
      const correct = isOptionLabel && redOptionPositions.some((position) => Math.abs(position.x - x) < 1 && Math.abs(position.y - y) < 1);
      line.items.push({ text: item.str.trim(), x, correct });
    }

    const pageText = lines
      .sort((left, right) => right.y - left.y)
      .map((line) => line.items
        .sort((left, right) => left.x - right.x)
        .map((item) => `${item.text}${item.correct ? " [CORRECT]" : ""}`)
        .join(" "))
      .join("\n");
    text += `${pageText}\n\n`;
  }

  return normalizeDocumentText(text);
}

async function extractDocumentText(fileName: string, buffer: Buffer) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  if (lowerName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeDocumentText(result.value);
  }

  if (lowerName.endsWith(".doc") || lowerName.endsWith(".txt") || lowerName.endsWith(".rtf")) {
    return normalizeDocumentText(buffer.toString("utf8"));
  }

  return normalizeDocumentText(buffer.toString("utf8"));
}

function fallbackDocumentQuestionParser(rawText: string): ParsedQuestionDocumentCandidate[] {
  const blocks = rawText
    .split(/\n\s*(?=(?:\d+[\.)]|Question\s+\d+|Q\s*\d+))/i)
    .map((block) => block.trim())
    .filter((block) => block.length > 30);

  const parsed: ParsedQuestionDocumentCandidate[] = [];

  for (const block of blocks) {
    const lines = block.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const prompts: string[] = [];
    const optionEntries: { letter: string; text: string }[] = [];
    const markedCorrectLetters: string[] = [];
    let answerLetter = "";

    for (const line of lines) {
      const optionMatch = line.match(/^([A-E])(?:[\.)]|\s*[-:])\s*(.+)$/i);
      if (optionMatch) {
        if (line.includes("[CORRECT]")) markedCorrectLetters.push(optionMatch[1].toUpperCase());
        optionEntries.push({
          letter: optionMatch[1].toUpperCase(),
          text: normalizeWhitespace(optionMatch[2].replace(/\[CORRECT\]/g, "")),
        });
        continue;
      }

      const answerMatch = line.match(/(?:answer|correct answer|key)\s*[:\-]?\s*([A-D])/i);
      if (answerMatch) {
        answerLetter = answerMatch[1].toUpperCase();
        continue;
      }

      if (optionEntries.length > 0 && !line.includes("[CORRECT]")) {
        const lastOption = optionEntries[optionEntries.length - 1];
        lastOption.text = normalizeWhitespace(`${lastOption.text} ${line}`);
        continue;
      }

      if (!/^(?:answer|correct answer|key)\b/i.test(line) && !/^[A-D][\.)]/i.test(line)) {
        prompts.push(line);
      }
    }

    if (optionEntries.length < 2) continue;
    const hasPdfColorMarks = block.includes("[CORRECT]");
    if (hasPdfColorMarks && (optionEntries.length !== 4 || markedCorrectLetters.length !== 1)) continue;
    const markedAnswer = markedCorrectLetters[0] ?? answerLetter;
    const answerIndex = markedAnswer ? optionEntries.findIndex((option) => option.letter === markedAnswer) : -1;
    if (answerIndex < 0) continue;

    const prompt = normalizeWhitespace(prompts.join(" ") || lines.join(" "));
    if (prompt.length < 20) continue;

    parsed.push({
      prompt,
      options: optionEntries.map((option) => option.text),
      correctOption: answerIndex,
      explanation: `The uploaded document identified option ${String.fromCharCode(65 + answerIndex)} as the correct answer.`,
      courseName: guessCourseFromText(block),
    });
  }

  if (parsed.length > 0) return parsed;

  const paragraphs = rawText.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  let previousAnswerIndex = -1;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const answerMarker = paragraphs[index].match(/^correct answer\s*:?\s*(.*)$/i);
    if (!answerMarker) continue;

    const groupStart = previousAnswerIndex + 1;
    let scoreIndex = -1;
    for (let candidateIndex = index - 1; candidateIndex >= groupStart; candidateIndex -= 1) {
      if (/^\d+\s*\/\s*\d+$/.test(paragraphs[candidateIndex])) {
        scoreIndex = candidateIndex;
        break;
      }
    }

    const nextAnswerIndex = index + (answerMarker[1] ? 0 : 1);
    const answerText = answerMarker[1] || paragraphs[nextAnswerIndex] || "";
    if (scoreIndex >= groupStart && answerText) {
      const promptParagraphs = paragraphs.slice(groupStart, scoreIndex);
      const prompt = normalizeWhitespace(promptParagraphs[promptParagraphs.length - 1] ?? "");
      const optionEntries = paragraphs.slice(scoreIndex + 1, index).map((option, optionIndex) => {
        const optionMatch = option.match(/^([A-D])(?:[.)]|\s*[-:])\s*(.+)$/i);
        return {
          letter: optionMatch?.[1].toUpperCase() ?? String.fromCharCode(65 + optionIndex),
          text: normalizeWhitespace(optionMatch?.[2] ?? option),
        };
      }).filter((option) => option.text.length > 0);
      const normalizedAnswer = normalizeWhitespace(answerText).replace(/^[A-D][.)]?\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      const answerLetter = answerText.trim().match(/^([A-D])(?:[.)])?$/i)?.[1].toUpperCase();
      const answerIndex = answerLetter
        ? optionEntries.findIndex((option) => option.letter === answerLetter)
        : optionEntries.findIndex((option) => option.text.toLowerCase().replace(/[^a-z0-9]+/g, "") === normalizedAnswer);

      if (prompt.length >= 10 && optionEntries.length >= 2 && answerIndex >= 0) {
        parsed.push({
          prompt,
          options: optionEntries.map((option) => option.text),
          correctOption: answerIndex,
          explanation: `The uploaded document identifies option ${String.fromCharCode(65 + answerIndex)} as the correct answer.`,
          courseName: guessCourseFromText(prompt),
        });
      }
    }

    previousAnswerIndex = nextAnswerIndex;
  }

  return parsed;
}

async function callOpenAiForQuestions(rawText: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const prompt = `Extract nursing exam questions from the document text below.
Return valid JSON only as an array of objects with this exact shape:
[{"prompt":"question text","options":["option A","option B","option C","option D"],"correctOption":2,"explanation":"reasoning or rationale","courseName":"course name"}]
Rules:
- Only include question items that have a clear question and four answer options.
- correctOption must be a zero-based index: 0=first option, 1=second option, etc.
- If an item does not have a clear answer, skip it.
- If no answer is found, skip it.
- Keep the question text and options concise.
Document text:
${rawText.slice(0, 120000)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: "You help convert exam documents into structured JSON questions with correct answers." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI extraction failed with status ${response.status}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "[]";
  const jsonText = content.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? content;
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.questions) ? parsed.questions : [];
}

async function parseQuestionDocumentCandidates(rawText: string) {
  if (rawText.includes("[CORRECT]")) return fallbackDocumentQuestionParser(rawText);

  try {
    const aiResult = await callOpenAiForQuestions(rawText);
    if (Array.isArray(aiResult) && aiResult.length > 0) {
      return aiResult.map((question) => ({
        prompt: normalizeWhitespace(String(question.prompt ?? "")),
        options: Array.isArray(question.options) ? question.options.map((option: unknown) => normalizeWhitespace(String(option))) : [],
        correctOption: Number(question.correctOption ?? 0),
        explanation: typeof question.explanation === "string" ? question.explanation : undefined,
        courseName: typeof question.courseName === "string" ? question.courseName : guessCourseFromText(rawText),
      })).filter((question) => question.prompt && question.options.length >= 2 && Number.isInteger(question.correctOption) && question.correctOption >= 0 && question.correctOption < question.options.length);
    }
  } catch {
    // Fall back to the local parser when AI is unavailable or fails.
  }

  return fallbackDocumentQuestionParser(rawText);
}

export async function importProvidedPastQuestions() {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "admin") return { error: "Only administrators can import past questions." };

  const sourcePath = join(process.cwd(), "public", "PASt question", "Principles of management exams.txt");
  let rawText: string;
  try {
    rawText = await readFile(sourcePath, "utf8");
  } catch {
    return { error: "The supplied past-question text file could not be found." };
  }

  const parsed = parseSourceQuestions(rawText);
  if (parsed.length === 0) return { error: "No questions with answer keys could be parsed from the supplied file." };

  const supabase = await createClient();
  const sourceKey = "provided:principles-of-management-and-teaching";
  const { data: source, error: sourceError } = await supabase
    .from("question_sources")
    .upsert({
      source_key: sourceKey,
      title: "Principles of Management and Teaching",
      original_filename: "Principles of management exams.txt",
      created_by: auth.userId,
    }, { onConflict: "source_key" })
    .select("id")
    .single();

  if (sourceError || !source) return { error: `Could not save question source: ${sourceError?.message ?? "unknown error"}` };

  const courseNames = [...new Set(parsed.map((question) => question.course))];
  const courseRows = courseNames.map((name) => ({
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  }));
  const { error: courseUpsertError } = await supabase.from("courses").upsert(courseRows, { onConflict: "slug" });
  if (courseUpsertError) return { error: `Could not save courses: ${courseUpsertError.message}` };

  const { data: savedCourses, error: courseReadError } = await supabase.from("courses").select("id,name,slug").in("name", courseNames);
  if (courseReadError || !savedCourses) return { error: `Could not load courses: ${courseReadError?.message ?? "unknown error"}` };

  const courseIds = new Map(savedCourses.map((course) => [course.name, course.id]));
  const questionRows = parsed.flatMap((question) => {
    const courseId = courseIds.get(question.course);
    return courseId ? [{
      source_id: source.id,
      course_id: courseId,
      source_question_number: question.id,
      prompt: question.prompt,
      options: question.options,
      correct_option: question.answer,
      explanation: question.explanation,
      question_type: "official_past",
      review_status: "approved",
    }] : [];
  });

  const { error: questionError } = await supabase
    .from("questions")
    .upsert(questionRows, { onConflict: "source_id,source_question_number" });

  if (questionError) return { error: `Could not import questions: ${questionError.message}` };
  return { imported: questionRows.length };
}

export async function importPastQuestionDocument(formData: FormData) {
  const files = formData.getAll("file").filter((value): value is File => value instanceof File);
  if (!files.length) return { error: "No file was sent for upload." };

  let totalImported = 0;
  let aiUsed = false;
  const sourceNames: string[] = [];

  for (const uploadedFile of files) {
    const bytes = Buffer.from(await uploadedFile.arrayBuffer());
    const rawText = await extractDocumentText(uploadedFile.name, bytes);
    if (!rawText) continue;

    const candidates = await parseQuestionDocumentCandidates(rawText);
    if (!candidates.length) continue;

    const auth = await getAuthContext();
    if (!auth || auth.role !== "admin") return { error: "Only administrators can upload past questions." };

    const sourceTitle = extractSourceTitle(uploadedFile.name);
    sourceNames.push(sourceTitle);
    const supabase = await createClient();
    const sourceKey = `upload:${crypto.randomUUID()}:${sourceTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const { data: source, error: sourceError } = await supabase
      .from("question_sources")
      .upsert({
        source_key: sourceKey,
        title: sourceTitle,
        original_filename: uploadedFile.name,
        created_by: auth.userId,
      }, { onConflict: "source_key" })
      .select("id")
      .single();

    if (sourceError || !source) return { error: `Could not save the uploaded document source: ${sourceError?.message ?? "unknown error"}` };

    const courseNames = [...new Set(candidates.map((question) => question.courseName ?? guessCourseFromText(rawText)))];
    const courseRows = courseNames.map((name) => ({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    }));
    const { error: courseUpsertError } = await supabase.from("courses").upsert(courseRows, { onConflict: "slug" });
    if (courseUpsertError) return { error: `Could not save document courses: ${courseUpsertError.message}` };

    const { data: savedCourses, error: courseReadError } = await supabase.from("courses").select("id,name,slug").in("name", courseNames);
    if (courseReadError || !savedCourses) return { error: `Could not load saved document courses: ${courseReadError?.message ?? "unknown error"}` };

    const courseIds = new Map(savedCourses.map((course) => [course.name, course.id]));
    const questionRows = candidates.flatMap((candidate, index) => {
      const courseName = candidate.courseName ?? guessCourseFromText(rawText);
      const courseId = courseIds.get(courseName);
      const options = candidate.options.slice(0, 4).filter((option: string) => option.trim().length > 0);
      if (!courseId || options.length < 2) return [];

      const correctOption = Math.min(candidate.correctOption, options.length - 1);
      return [{
        source_id: source.id,
        course_id: courseId,
        source_question_number: index + 1,
        prompt: candidate.prompt,
        options,
        correct_option: correctOption,
        explanation: candidate.explanation ?? `The uploaded source indicates option ${String.fromCharCode(65 + correctOption)} as the correct answer.`,
        question_type: "official_past",
        review_status: "approved",
      }];
    });

    if (questionRows.length === 0) continue;

    const { error: questionError } = await supabase
      .from("questions")
      .insert(questionRows);

    if (questionError) return { error: `Could not save extracted questions: ${questionError.message}` };

    totalImported += questionRows.length;
    aiUsed = aiUsed || (!!process.env.OPENAI_API_KEY && !rawText.includes("[CORRECT]"));
  }

  if (!totalImported) return { error: "No usable question blocks were extracted from the uploaded documents." };

  return {
    imported: totalImported,
    sourceTitle: sourceNames.join(", "),
    fileCount: files.length,
    aiUsed,
  };
}

export async function getAdminQuestionBank(status: string | null = null): Promise<{ questions?: AdminQuestion[]; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "admin") return { error: "Administrator access required." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_question_bank", { p_status: status });
  if (error) return { error: `Could not load question bank: ${error.message}` };
  return {
    questions: ((data ?? []) as AdminQuestionRow[]).map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
      correctOption: question.correct_option,
      courseName: question.course_name,
      sourceTitle: question.source_title,
      sourceYear: question.source_year,
      reviewStatus: question.review_status,
      questionType: question.question_type,
      sourceQuestionNumber: question.source_question_number,
    })),
  };
}

export async function setQuestionReviewStatus(questionId: string, status: "approved" | "rejected") {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "admin") return { error: "Administrator access required." };

  const supabase = await createClient();
  const { error } = await supabase.from("questions").update({ review_status: status }).eq("id", questionId);
  return error ? { error: `Could not update question review status: ${error.message}` } : { updated: true };
}

export async function deleteQuestion(questionId: string) {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "admin") return { error: "Administrator access required." };

  const supabase = await createClient();
  const { error } = await supabase.from("questions").delete().eq("id", questionId);
  return error ? { error: `Could not delete question: ${error.message}` } : { deleted: true };
}

export async function startPracticeSession(settings: PracticeSettings) {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to start practice." };
  if (![10, 20, 25, 50, 100].includes(settings.count)) return { error: "Choose a supported question count." };
  if (settings.timeLimitSeconds !== null && (!Number.isInteger(settings.timeLimitSeconds) || settings.timeLimitSeconds < 60 || settings.timeLimitSeconds > 14400 || settings.timeLimitSeconds % 60 !== 0)) {
    return { error: "Choose a whole-minute timer between 1 and 240 minutes." };
  }

  const supabase = await createClient();
  let questionsQuery = supabase
    .from("questions")
    .select("id,course_id")
    .eq("review_status", "approved");
  if (settings.courseId) questionsQuery = questionsQuery.eq("course_id", settings.courseId);

  const { data: availableQuestions, error: questionsError } = await questionsQuery;
  if (questionsError) return { error: `Could not load questions: ${questionsError.message}` };
  if (!availableQuestions?.length) return { error: "No approved past questions are available for this selection yet." };

  let candidateQuestions = availableQuestions;
  if (settings.questionSet === "mistakes" || settings.questionSet === "weak") {
    const { data: answers, error } = await supabase.from("student_answers").select("question_id,is_correct,selected_option");
    if (error) return { error: `Could not load your practice history: ${error.message}` };
    const questionsById = new Map(availableQuestions.map((question) => [question.id, question]));
    const answered = (answers ?? []).flatMap((answer) => {
      const question = questionsById.get(answer.question_id);
      return question && answer.selected_option !== null ? [{ question, isCorrect: answer.is_correct === true }] : [];
    });

    if (settings.questionSet === "mistakes") {
      const mistakes = new Set(answered.filter((answer) => !answer.isCorrect).map((answer) => answer.question.id));
      candidateQuestions = availableQuestions.filter((question) => mistakes.has(question.id));
    } else {
      const courseTotals = new Map<string, { total: number; wrong: number }>();
      for (const answer of answered) {
        const item = courseTotals.get(answer.question.course_id) ?? { total: 0, wrong: 0 };
        item.total += 1;
        if (!answer.isCorrect) item.wrong += 1;
        courseTotals.set(answer.question.course_id, item);
      }
      const weakCourseIds = new Set(
        [...courseTotals.entries()]
          .filter(([, totals]) => totals.total > 0)
          .sort((a, b) => b[1].wrong / b[1].total - a[1].wrong / a[1].total)
          .slice(0, Math.max(1, Math.ceil(courseTotals.size / 3)))
          .map(([courseId]) => courseId)
      );
      candidateQuestions = availableQuestions.filter((question) => weakCourseIds.has(question.course_id));
    }
  } else if (settings.questionSet === "bookmarks") {
    const { data: bookmarks, error } = await supabase.from("question_bookmarks").select("question_id");
    if (error) return { error: `Could not load your bookmarks: ${error.message}` };
    const bookmarkedIds = new Set((bookmarks ?? []).map((bookmark) => bookmark.question_id));
    candidateQuestions = availableQuestions.filter((question) => bookmarkedIds.has(question.id));
  }

  if (candidateQuestions.length === 0) {
    return { error: "There are no questions in this set yet. Complete some practice or add bookmarks first." };
  }

  const shuffled = [...candidateQuestions].sort(() => Math.random() - 0.5).slice(0, settings.count);
  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .insert({
      student_id: auth.userId,
      course_id: settings.courseId,
      question_set: settings.questionSet,
      question_count: shuffled.length,
      question_ids: shuffled.map((question) => question.id),
      time_limit_seconds: settings.timeLimitSeconds,
    })
    .select("id")
    .single();

  if (sessionError || !session) return { error: `Could not start practice: ${sessionError?.message ?? "unknown error"}` };
  return { sessionId: session.id };
}

export async function getPracticeSession(sessionId: string) {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to open this practice session." };

  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .select("id,question_ids,question_count,question_set,status,started_at,completed_at,time_limit_seconds")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) return { error: `Could not load practice session: ${sessionError?.message ?? "not found"}` };
  if (session.question_set === "mock_exam") return { error: "Open this attempt from Mock Examinations." };

  const sessionStatus = session.status;
  const completedAt = session.completed_at;

  const { data: questions, error: questionError } = await supabase
    .from("questions")
    .select("id,prompt,options,source_question_number,courses(name),question_sources(title,source_year)")
    .in("id", session.question_ids);
  if (questionError || !questions) return { error: `Could not load session questions: ${questionError?.message ?? "unknown error"}` };

  const { data: answers, error: answerError } = await supabase
    .from("student_answers")
    .select("question_id,selected_option,marked_for_review")
    .eq("practice_session_id", session.id);
  if (answerError) return { error: `Could not load saved answers: ${answerError.message}` };

  const completedAnswerMap = new Map<string, { selected_option: number | null; is_correct: boolean | null; correct_option: number | null; explanation: string | null; marked_for_review: boolean }>();
  if (sessionStatus === "completed") {
    const { data, error } = await supabase.rpc("get_practice_session_answers", { p_practice_session_id: session.id });
    if (error) return { error: `Could not load completed answers: ${error.message}` };
    const completedRows = (data ?? []) as {
      question_id: string;
      selected_option: number | null;
      is_correct: boolean | null;
      correct_option: number | null;
      explanation: string | null;
      marked_for_review: boolean;
    }[];
    for (const answer of completedRows) completedAnswerMap.set(answer.question_id, answer);
  }

  const questionMap = new Map(questions.map((question) => {
    const courseRelation = Array.isArray(question.courses) ? question.courses[0] : question.courses;
    const sourceRelation = Array.isArray(question.question_sources) ? question.question_sources[0] : question.question_sources;
    return [question.id, {
      id: question.id,
      prompt: question.prompt,
      options: question.options as string[],
      sourceQuestionNumber: question.source_question_number,
      courseName: courseRelation?.name ?? "Nursing practice",
      sourceTitle: sourceRelation?.title ?? "Past question",
      sourceYear: sourceRelation?.source_year ?? null,
    }];
  }));
  const sessionData: PracticeSessionData = {
      id: session.id,
      questionCount: session.question_count,
      questionSet: session.question_set,
      status: sessionStatus,
      startedAt: session.started_at,
      completedAt,
      timeLimitSeconds: session.time_limit_seconds,
      questions: session.question_ids.flatMap((id: string) => {
        const question = questionMap.get(id);
        return question ? [question] : [];
      }),
      answers: Object.fromEntries(sessionStatus === "completed"
        ? [...completedAnswerMap.entries()].map(([questionId, answer]) => [questionId, {
          selectedOption: answer.selected_option,
          isCorrect: answer.is_correct,
          markedForReview: answer.marked_for_review,
          correctOption: answer.correct_option,
          explanation: answer.explanation,
        }])
        : (answers ?? []).map((answer) => [answer.question_id, {
          selectedOption: answer.selected_option,
          markedForReview: answer.marked_for_review,
          isCorrect: null,
        }])),
  };
  return { session: sessionData };
}

export async function savePracticeAnswer(input: {
  sessionId: string;
  questionId: string;
  selectedOption: number | null;
  markedForReview: boolean;
}) {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to save answers." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_practice_answer", {
    p_practice_session_id: input.sessionId,
    p_question_id: input.questionId,
    p_selected_option: input.selectedOption,
    p_marked_for_review: input.markedForReview,
  });
  if (error) return { error: `Could not save answer: ${error.message}` };

  const feedback = Array.isArray(data) ? data[0] : data;
  return { saved: true, expired: feedback?.expired === true };
}

export async function finishPracticeSession(sessionId: string) {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to finish practice." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("finish_practice_session", { p_practice_session_id: sessionId });
  if (error) return { error: `Could not finish practice: ${error.message}` };
  const refreshed = await getPracticeSession(sessionId);
  if ("error" in refreshed || !refreshed.session) return { error: refreshed.error ?? "Could not load completed answers." };
  return { completed: true, session: refreshed.session };
}

export async function getStudentBookmarks(): Promise<{ bookmarks?: StudentBookmark[]; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to view bookmarks." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_bookmarks")
    .select("question_id,created_at,questions!inner(prompt,courses(name),question_sources(title,source_year))")
    .order("created_at", { ascending: false });
  if (error) return { error: `Could not load bookmarks: ${error.message}` };

  return {
    bookmarks: (data ?? []).map((row) => {
      const question = Array.isArray(row.questions) ? row.questions[0] : row.questions;
      const course = Array.isArray(question?.courses) ? question.courses[0] : question?.courses;
      const source = Array.isArray(question?.question_sources) ? question.question_sources[0] : question?.question_sources;
      return {
        questionId: row.question_id,
        prompt: question?.prompt ?? "Question text unavailable",
        courseName: course?.name ?? "Nursing practice",
        sourceTitle: source?.title ?? "Past question",
        sourceYear: source?.source_year ?? null,
        createdAt: row.created_at,
      };
    }),
  };
}

export async function setQuestionBookmarked(questionId: string, bookmarked: boolean) {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to save bookmarks." };

  const supabase = await createClient();
  if (!bookmarked) {
    const { error } = await supabase
      .from("question_bookmarks")
      .delete()
      .eq("student_id", auth.userId)
      .eq("question_id", questionId);
    return error ? { error: `Could not remove bookmark: ${error.message}` } : { saved: true };
  }

  const { error } = await supabase.from("question_bookmarks").insert({ student_id: auth.userId, question_id: questionId });
  if (error?.code === "23505") return { saved: true };
  return error ? { error: `Could not save bookmark: ${error.message}` } : { saved: true };
}

export async function getStudentMistakes(): Promise<{ mistakes?: StudentMistake[]; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to review mistakes." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_practice_mistakes");
  if (error) return { error: `Could not load mistakes: ${error.message}` };
  return {
    mistakes: ((data ?? []) as StudentMistakeRow[]).map((row) => ({
      questionId: row.question_id,
      prompt: row.prompt,
      options: row.options as string[],
      selectedOption: row.selected_option,
      correctOption: row.correct_option,
      explanation: row.explanation,
      courseName: row.course_name,
      sourceTitle: row.source_title,
      sourceYear: row.source_year,
      attemptedAt: row.attempted_at,
    })),
  };
}