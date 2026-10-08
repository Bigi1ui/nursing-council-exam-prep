import { MistakesPage } from "@/components/student-data-pages";
import { getStudentMistakes } from "@/lib/actions/practice";

export default function Page() {
  return getStudentMistakes().then((result) => <MistakesPage mistakes={"mistakes" in result ? result.mistakes ?? [] : []} error={"error" in result ? result.error : undefined} />);
}