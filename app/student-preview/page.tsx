import { redirect } from "next/navigation";
import { LiveStudentDashboard } from "@/components/live-student-dashboard";
import { StudentShell } from "@/components/student-shell";
import { getAuthContext } from "@/lib/auth/session";

export const instant = false;

export default async function StudentPreviewPage() {
  const auth = await getAuthContext();

  if (!auth) redirect("/login");
  if (auth.role !== "admin") redirect("/student/dashboard");

  return (
    <StudentShell profile={auth.profile} preview>
      <LiveStudentDashboard profile={auth.profile} summary={null} preview />
    </StudentShell>
  );
}