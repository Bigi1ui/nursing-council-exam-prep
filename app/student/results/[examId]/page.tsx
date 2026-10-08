import { ResultsPage } from "@/components/student-data-pages";
import { getMockExamResults } from "@/lib/actions/mock-exam";

export default async function Page() {
  const response = await getMockExamResults();
  return <ResultsPage results={response.results ?? []} error={response.error} />;
}