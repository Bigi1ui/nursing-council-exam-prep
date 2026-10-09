import { StudentSolutionReviewPage } from "@/components/student-solutions";
import { getStudentSolutionReview } from "@/lib/actions/solutions";

export default async function Page({ params }: PageProps<"/student/solutions/[sessionId]">) {
  const { sessionId } = await params;
  const result = await getStudentSolutionReview(sessionId);
  return <StudentSolutionReviewPage review={"review" in result ? result.review ?? null : null} error={"error" in result ? result.error : undefined} />;
}