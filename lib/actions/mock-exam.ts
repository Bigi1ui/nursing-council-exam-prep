"use server";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type MockExamQuestion = {
  id: string;
  prompt: string;
  options: string[];
  courseName: string;
  sourceTitle: string;
  sourceYear: number | null;
};

export type MockExamAnswer = {
  selectedOption: number | null;
  markedForReview: boolean;
};

export type MockExamSessionData = {
  id: string;
  sessionName: string;
  status: "in_progress" | "completed";
  startedAt: string;
  completedAt: string | null;
  timeLimitSeconds: number;
  questions: MockExamQuestion[];
  answers: Record<string, MockExamAnswer>;
  result: { correctCount: number; answeredCount: number; questionCount: number } | null;
};

type FinishMockExamRow = {
  correct_count: number;
  answered_count: number;
  question_count: number;
  exam_completed_at: string;
};

export type MockExamResultSummary = {
  id: string;
  sessionName: string;
  status: "in_progress" | "completed";
  questionCount: number;
  timeLimitSeconds: number;
  startedAt: string;
  completedAt: string | null;
  answeredCount: number;
  correctCount: number | null;
  scorePercent: number | null;
};

export async function getMockExamSetupData(): Promise<{ questionCount?: number; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to start a mock exam." };

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "approved");

  if (error) return { error: `Could not load the approved question count: ${error.message}` };
  return { questionCount: count ?? 0 };
}

export async function startMockExam(timeLimitSeconds: number) {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to start a mock exam." };
  if (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 60 || timeLimitSeconds > 14400 || timeLimitSeconds % 60 !== 0) {
    return { error: "Choose a whole-minute exam duration between 1 and 240 minutes." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_mock_exam", { p_time_limit_seconds: timeLimitSeconds });
  if (error || typeof data !== "string") return { error: `Could not start the mock exam: ${error?.message ?? "no session was returned"}` };
  return { sessionId: data };
}

export async function saveMockExamAnswer(input: {
  sessionId: string;
  questionId: string;
  selectedOption: number | null;
  markedForReview: boolean;
}) {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to save exam answers." };
  if (input.selectedOption !== null && (!Number.isInteger(input.selectedOption) || input.selectedOption < 0 || input.selectedOption > 4)) {
    return { error: "Choose a valid answer option." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_mock_exam_answer", {
    p_practice_session_id: input.sessionId,
    p_question_id: input.questionId,
    p_selected_option: input.selectedOption,
    p_marked_for_review: input.markedForReview,
  });
  if (error) return { error: `Could not save exam answer: ${error.message}` };

  const response = Array.isArray(data) ? data[0] : data;
  return { saved: response?.saved === true, expired: response?.expired === true };
}

export async function finishMockExam(sessionId: string) {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to submit the exam." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finish_mock_exam", { p_practice_session_id: sessionId });
  if (error) return { error: `Could not submit the mock exam: ${error.message}` };

  const result = (Array.isArray(data) ? data[0] : data) as FinishMockExamRow | null;
  if (!result) return { error: "The mock exam result was not returned. Please reload this session." };

  return {
    result: {
      correctCount: result.correct_count,
      answeredCount: result.answered_count,
      questionCount: result.question_count,
    },
  };
}

export async function getMockExamSession(sessionId: string): Promise<{ session?: MockExamSessionData; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to open this mock exam." };

  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .select("id,session_name,question_ids,question_count,question_set,status,started_at,completed_at,time_limit_seconds")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session || session.question_set !== "mock_exam" || !session.time_limit_seconds) {
    return { error: `Could not load mock exam: ${sessionError?.message ?? "session not found"}` };
  }

  const status = session.status as MockExamSessionData["status"];
  const completedAt = session.completed_at;

  const [questionsResult, answersResult] = await Promise.all([
    supabase
      .from("questions")
      .select("id,prompt,options,courses(name),question_sources(title,source_year)")
      .in("id", session.question_ids),
    supabase
      .from("student_answers")
      .select("question_id,selected_option,is_correct,marked_for_review")
      .eq("practice_session_id", session.id),
  ]);

  if (questionsResult.error || answersResult.error) {
    const error = questionsResult.error ?? answersResult.error;
    return { error: `Could not load mock exam data: ${error?.message ?? "unknown database error"}` };
  }

  const questionMap = new Map((questionsResult.data ?? []).map((question) => {
    const course = Array.isArray(question.courses) ? question.courses[0] : question.courses;
    const source = Array.isArray(question.question_sources) ? question.question_sources[0] : question.question_sources;
    return [question.id, {
      id: question.id,
      prompt: question.prompt,
      options: question.options as string[],
      courseName: course?.name ?? "Nursing practice",
      sourceTitle: source?.title ?? "Past question",
      sourceYear: source?.source_year ?? null,
    } satisfies MockExamQuestion];
  }));
  const questions = session.question_ids.flatMap((id: string) => {
    const question = questionMap.get(id);
    return question ? [question] : [];
  });
  if (questions.length !== session.question_count) {
    return { error: "Some approved questions in this exam are no longer available. Contact an administrator." };
  }

  const answerRows = answersResult.data ?? [];
  const answers = Object.fromEntries(answerRows.map((answer) => [answer.question_id, {
    selectedOption: answer.selected_option,
    markedForReview: answer.marked_for_review,
  } satisfies MockExamAnswer]));
  const result = status === "completed" ? {
    correctCount: answerRows.filter((answer) => answer.is_correct === true).length,
    answeredCount: answerRows.filter((answer) => answer.selected_option !== null).length,
    questionCount: session.question_count,
  } : null;

  return {
    session: {
      id: session.id,
      sessionName: session.session_name,
      status,
      startedAt: session.started_at,
      completedAt,
      timeLimitSeconds: session.time_limit_seconds,
      questions,
      answers,
      result,
    },
  };
}

export async function getMockExamResults(): Promise<{ results?: MockExamResultSummary[]; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to view mock exam results." };

  const supabase = await createClient();
  const { data: sessions, error: sessionError } = await supabase
    .from("practice_sessions")
    .select("id,session_name,question_count,status,started_at,completed_at,time_limit_seconds")
    .eq("student_id", auth.userId)
    .eq("question_set", "mock_exam")
    .order("started_at", { ascending: false });

  if (sessionError) return { error: `Could not load mock exam results: ${sessionError.message}` };
  if (!sessions?.length) return { results: [] };

  const sessionIds = sessions.map((session) => session.id);
  const { data: answers, error: answerError } = await supabase
    .from("student_answers")
    .select("practice_session_id,selected_option,is_correct")
    .in("practice_session_id", sessionIds);

  if (answerError) return { error: `Could not load mock exam scores: ${answerError.message}` };

  const statsBySession = new Map(sessionIds.map((id) => [id, { answeredCount: 0, correctCount: 0 }]));
  for (const answer of answers ?? []) {
    const stats = statsBySession.get(answer.practice_session_id);
    if (!stats) continue;
    if (answer.selected_option !== null) stats.answeredCount += 1;
    if (answer.is_correct === true) stats.correctCount += 1;
  }

  return {
    results: sessions.map((session) => {
      const stats = statsBySession.get(session.id) ?? { answeredCount: 0, correctCount: 0 };
      const isCompleted = session.status === "completed";
      return {
        id: session.id,
        sessionName: session.session_name,
        status: session.status as MockExamResultSummary["status"],
        questionCount: session.question_count,
        timeLimitSeconds: session.time_limit_seconds ?? 0,
        startedAt: session.started_at,
        completedAt: session.completed_at,
        answeredCount: stats.answeredCount,
        correctCount: isCompleted ? stats.correctCount : null,
        scorePercent: isCompleted && session.question_count > 0
          ? Math.round((stats.correctCount / session.question_count) * 100)
          : null,
      };
    }),
  };
}