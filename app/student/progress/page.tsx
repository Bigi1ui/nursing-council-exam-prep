import { ProgressPage } from "@/components/student-data-pages";
import { getStudentPracticeSummary } from "@/lib/actions/practice";

export default async function Page() {
  const result = await getStudentPracticeSummary();
  return <ProgressPage summary={"summary" in result ? result.summary ?? null : null} error={"error" in result ? result.error : undefined} />;
}