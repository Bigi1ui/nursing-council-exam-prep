import { LiveStudentDashboard } from "@/components/live-student-dashboard";
import { requireAuthContext } from "@/lib/auth/session";
import { getStudentPracticeSummary } from "@/lib/actions/practice";

export const instant = false;

export default async function Page() {
  const auth = await requireAuthContext(["student"]);
  const result = await getStudentPracticeSummary();

  return <LiveStudentDashboard profile={auth.profile} summary={"summary" in result ? result.summary ?? null : null} error={"error" in result ? result.error : undefined} />;
}
