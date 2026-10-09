"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type AchievementSummary = {
  key: string;
  name: string;
  description: string;
  iconPath: string;
  xpReward: number;
  unlockedAt: string | null;
};

export type ReadinessComponentKey = "accuracy" | "mockPerformance" | "courseCoverage" | "consistency" | "improvement";

export type ReadinessSummary = {
  score: number | null;
  label: string;
  components: Record<ReadinessComponentKey, number | null>;
  weakCourses: { courseName: string; answered: number; accuracy: number }[];
  evidence: {
    practiceQuestions: number;
    coursesAnswered: number;
    coursesCovered: number;
    activeCourses: number;
    fullMockExams: number;
    comparableAssessments: number;
  };
};

export type StudentGamificationSummary = {
  totalXp: number;
  level: number;
  levelTitle: string;
  levelFloorXp: number;
  nextLevelXp: number | null;
  levelProgress: number;
  readiness: ReadinessSummary;
  readinessHistory: { date: string; score: number }[];
  achievements: AchievementSummary[];
};

export async function getStudentGamificationSummary(): Promise<{ summary?: StudentGamificationSummary; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to view study rewards." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_gamification_summary");
  if (error) return { error: `Could not load study rewards: ${error.message}` };
  if (!data || typeof data !== "object") return { error: "Study rewards were not returned." };

  return { summary: data as StudentGamificationSummary };
}

export async function claimAttemptReviewXp(sessionId: string): Promise<{ xpEarned?: number; error?: string }> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "student") return { error: "Sign in as a student to claim review XP." };
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { error: "That study attempt could not be verified." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_attempt_review_xp", { p_practice_session_id: sessionId });
  if (error) return { error: `Could not record answer review: ${error.message}` };

  for (const path of ["/student/dashboard", "/student/progress", "/student/achievements"]) revalidatePath(path);
  return { xpEarned: typeof data === "number" ? data : 0 };
}