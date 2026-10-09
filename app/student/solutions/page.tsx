import { StudentSolutionsPage } from "@/components/student-solutions";
import { getStudentSolutionSessions } from "@/lib/actions/solutions";

export default async function Page() {
  const result = await getStudentSolutionSessions();
  return <StudentSolutionsPage sessions={"sessions" in result ? result.sessions ?? [] : []} error={"error" in result ? result.error : undefined} />;
}