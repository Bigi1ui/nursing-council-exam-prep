"use server";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type StudentSolutionSession = {
  id: string;
  name: string;
  questionSet: string;
  questionCount: number;
  timeLimitSeconds: number | null;
  startedAt: string;
  completedAt: string | null;
  answeredCount: number;
  correctCount: number;
};

export type StudentQuestionSolution = {
  questionId: string;
  questionOrder: number;
  prompt: string;
  options: string[];
  selectedOption: number;
  correctOption: number;
  isCorrect: boolean;
  explanation: string | null;
  courseName: string;
  sourceTitle: string;
  sourceYear: number | null;
  sourceQuestionNumber: number;
};

export type StudentSolutionReview = StudentSolutionSession & {
  questions: StudentQuestionSolution[];
};

type StudentSolutionSessionRow = {
  session_id: string;
  session_name: string;
  question_set: string;
  question_count: number;
  time_limit_seconds: number | null;
  started_at: string;
  completed_at: string | null;
  answered_count: number;
  correct_count: number;
};

type StudentQuestionSolutionRow = {
  question_id: string;
  question_order: number;
  prompt: string;
  options: string[];
  selected_option: number;
  correct_option: number;
  is_correct: boolean;
  explanation: string | null;
  course_name: string;
  source_title: string;
  source_year: number | null;
  source_question_number: number;
};

function mapSession(row: StudentSolutionSessionRow): StudentSolutionSession {
  return {
    id: row.session_id,
    name: row.session_name,
    questionSet: row.question_set,
    questionCount: row.question_count,
    timeLimitSeconds: row.time_limit_seconds,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    answeredCount: row.answered_count,
    correctCount: row.correct_count,
  };
}

export async function getStudentSolutionSessions(): Promise<{ sessions?: StudentSolutionSession[]; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to view saved solutions." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_completed_solution_sessions");
  if (error) return { error: `Could not load saved solutions: ${error.message}` };

  return { sessions: ((data ?? []) as StudentSolutionSessionRow[]).map(mapSession) };
}

export async function getStudentSolutionReview(sessionId: string): Promise<{ review?: StudentSolutionReview; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to review saved solutions." };
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { error: "That completed study session could not be found." };

  const supabase = await createClient();
  const [sessionsResult, solutionsResult] = await Promise.all([
    supabase.rpc("get_my_completed_solution_sessions"),
    supabase.rpc("get_my_completed_session_solutions", { p_practice_session_id: sessionId }),
  ]);

  const error = sessionsResult.error ?? solutionsResult.error;
  if (error) return { error: `Could not load this solution review: ${error.message}` };

  const sessionRow = ((sessionsResult.data ?? []) as StudentSolutionSessionRow[]).find((row) => row.session_id === sessionId);
  if (!sessionRow) return { error: "Completed solution session not found." };

  const questions = ((solutionsResult.data ?? []) as StudentQuestionSolutionRow[]).map((row) => ({
    questionId: row.question_id,
    questionOrder: row.question_order,
    prompt: row.prompt,
    options: row.options,
    selectedOption: row.selected_option,
    correctOption: row.correct_option,
    isCorrect: row.is_correct,
    explanation: row.explanation,
    courseName: row.course_name,
    sourceTitle: row.source_title,
    sourceYear: row.source_year,
    sourceQuestionNumber: row.source_question_number,
  }));

  return { review: { ...mapSession(sessionRow), questions } };
}