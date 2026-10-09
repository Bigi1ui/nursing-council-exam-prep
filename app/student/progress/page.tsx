import { ProgressPage } from "@/components/student-data-pages";
import { getStudentPracticeSummary } from "@/lib/actions/practice";
import { getStudentGamificationSummary } from "@/lib/actions/gamification";

export default async function Page() {
  const [result, gamificationResult] = await Promise.all([getStudentPracticeSummary(), getStudentGamificationSummary()]);
  return <ProgressPage summary={"summary" in result ? result.summary ?? null : null} error={"error" in result ? result.error : undefined} gamification={"summary" in gamificationResult ? gamificationResult.summary ?? null : null} gamificationError={"error" in gamificationResult ? gamificationResult.error : undefined} />;
}