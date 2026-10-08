import { StudentBookmarks } from "@/components/student-bookmarks";
import { getStudentBookmarks } from "@/lib/actions/practice";

export default function Page() {
  return getStudentBookmarks().then((result) => <StudentBookmarks initialBookmarks={"bookmarks" in result ? result.bookmarks ?? [] : []} error={"error" in result ? result.error : undefined} />);
}