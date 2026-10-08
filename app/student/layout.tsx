import { Suspense, type ReactNode } from "react";
import { requireAuthContext } from "@/lib/auth/session";
import { StudentShell } from "@/components/student-shell";

export const instant = false;

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <Suspense fallback={<WorkspaceFallback label="Loading student workspace..." />}>
      <ProtectedStudentLayout>{children}</ProtectedStudentLayout>
    </Suspense>
  );
}

async function ProtectedStudentLayout({ children }: { children: ReactNode }) {
  const auth = await requireAuthContext(["student"]);

  return <StudentShell profile={auth.profile}>{children}</StudentShell>;
}

function WorkspaceFallback({ label }: { label: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f3f7fb] px-5 text-center">
      <div>
        <p className="eyebrow mb-2">Secure workspace</p>
        <p className="m-0 text-[13px] font-semibold text-[#324a63]">{label}</p>
      </div>
    </div>
  );
}
