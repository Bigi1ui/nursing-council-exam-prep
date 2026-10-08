'use client';

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/auth/session";
import { BrandMark } from "@/components/brand-mark";
import { StudentSidebar } from "@/components/student-sidebar";
import { LogoutButton } from "@/components/logout-button";

function ActiveStudentSidebar() {
  const activePath = usePathname();
  return <StudentSidebar activePath={activePath === "/" ? "/student/dashboard" : activePath} />;
}

export function StudentShell({ children, profile, preview = false }: { children: React.ReactNode; profile?: Profile; preview?: boolean }) {
  const displayName = profile?.full_name || profile?.email || "Student";
  const firstInitial = displayName.trim().charAt(0).toUpperCase() || "S";

  return (
    <div className="app-grid">
      {preview ? (
        <aside className="app-sidebar flex min-h-screen flex-col bg-[#102845] px-3 py-5 text-white">
          <Link href="/admin/dashboard" className="mb-8 flex items-center gap-2 px-2 text-white no-underline"><span className="grid size-8 place-items-center rounded-md bg-white/10">←</span><span className="sidebar-brand-name text-[14px] font-bold">Administration</span></Link>
          <p className="sidebar-section-label mb-2 px-3 text-[9px] font-bold uppercase tracking-[.16em] text-[#849bb5]">Read-only preview</p>
        </aside>
      ) : (
        <Suspense fallback={<StudentSidebar activePath="/student/dashboard" />}><ActiveStudentSidebar /></Suspense>
      )}
      <div className="min-w-0">
        <header className="flex h-[64px] items-center justify-between border-b border-[#e5ecf3] bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link className="mobile-menu-button flex items-center gap-2 text-sm font-bold text-[#1d3551] no-underline" href={preview ? "/admin/dashboard" : "/student/dashboard"}><BrandMark size={24} />NursePrep</Link>
            <span className="hidden text-[11px] text-[#8190a3] sm:inline">{preview ? "Student preview" : "Student workspace"}</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Notifications" className="grid size-8 place-items-center rounded-full border border-[#e7edf3] bg-white text-[#496078]">♧</button>
            <span className="hidden text-right text-[11px] font-semibold text-[#344a62] sm:inline">{displayName}<br /><span className="font-normal capitalize text-[#8492a3]">{profile?.role ?? "student"}</span></span>
            <span className="grid size-8 place-items-center rounded-full bg-[#e9f0ff] text-[11px] font-bold text-[#345bbb]">{firstInitial}</span>
            <LogoutButton className="hidden min-h-8 rounded border border-[#dbe5ef] px-3 text-[10px] font-bold text-[#41576f] sm:inline-flex">
              Logout
            </LogoutButton>
          </div>
        </header>
        <main className="main-surface">{children}</main>
      </div>
      {!preview && <nav className="mobile-bottom-nav" aria-label="Student quick navigation">
        {[["Home", "/student/dashboard", "▦"], ["Practice", "/student/practice", "✎"], ["Mock exam", "/student/mock-exam", "◷"], ["Progress", "/student/progress", "⌁"]].map(([label, href, icon]) => <Link key={href} href={href}><span aria-hidden="true">{icon}</span>{label}</Link>)}
      </nav>}
    </div>
  );
}
