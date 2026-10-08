import { Suspense, type ReactNode } from "react";
import { requireAuthContext } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin-shell";

export const instant = false;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<WorkspaceFallback label="Loading admin workspace..." />}>
      <ProtectedAdminLayout>{children}</ProtectedAdminLayout>
    </Suspense>
  );
}

async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const auth = await requireAuthContext(["admin"]);

  return <AdminShell profile={auth.profile}>{children}</AdminShell>;
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
