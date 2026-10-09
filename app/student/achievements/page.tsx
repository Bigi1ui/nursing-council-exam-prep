import { AchievementsPage } from "@/components/student-data-pages";
import { getStudentGamificationSummary } from "@/lib/actions/gamification";
import { requireAuthContext } from "@/lib/auth/session";

export default async function Page() {
  await requireAuthContext(["student"]);
  const result = await getStudentGamificationSummary();
  return <AchievementsPage summary={"summary" in result ? result.summary ?? null : null} error={"error" in result ? result.error : undefined} />;
}