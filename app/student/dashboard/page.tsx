import { LiveStudentDashboard } from "@/components/live-student-dashboard";
import { requireAuthContext } from "@/lib/auth/session";
import { getStudentPracticeSummary } from "@/lib/actions/practice";
import { getStudentGamificationSummary } from "@/lib/actions/gamification";

export const instant = false;

export default async function Page() {
  const auth = await requireAuthContext(["student"]);
  const [result, gamificationResult] = await Promise.all([getStudentPracticeSummary(), getStudentGamificationSummary()]);

  return <LiveStudentDashboard profile={auth.profile} summary={"summary" in result ? result.summary ?? null : null} error={"error" in result ? result.error : undefined} gamification={"summary" in gamificationResult ? gamificationResult.summary ?? null : null} gamificationError={"error" in gamificationResult ? gamificationResult.error : undefined} />;
}
