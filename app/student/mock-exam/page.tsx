import { MockExamList } from "@/components/mock-exam-status";
import { getMockExamSetupData } from "@/lib/actions/mock-exam";

export default async function Page() {
  const setup = await getMockExamSetupData();
  return <MockExamList questionCount={setup.questionCount ?? 0} setupError={setup.error} />;
}