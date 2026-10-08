'use client';

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/auth/session";
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/logout-button";

const adminLinks = [
  ["Dashboard", "/admin/dashboard", "▦"],
  ["Questions", "/admin/questions", "▤"],
  ["Upload past questions", "/admin/upload", "⇧"],
  ["AI review queue", "/admin/ai-questions", "✦"],
  ["Students", "/admin/students", "♙"],
  ["Exams", "/admin/exams", "◷"],
  ["Analytics", "/admin/analytics", "⌁"],
  ["Settings", "/admin/settings", "⚙"],
];

function adminLabel(label: string) {
  if (label === "Upload past questions") {
    return "Upload";
  }

  if (label === "AI review queue") {
    return "AI Questions";
  }

  return label;
}

function AdminNavigation() {
  const pathname = usePathname();
  return <nav className="flex flex-col gap-1" aria-label="Admin navigation">{adminLinks.map(([label, href, glyph]) => { const active = pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(href)); return <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><span className="grid w-4 place-items-center">{glyph}</span><span className="nav-label">{adminLabel(label)}</span></Link>; })}</nav>;
}

export function AdminShell({ children, profile }: { children: React.ReactNode; profile?: Profile }) {
  const displayName = profile?.full_name || profile?.email || "Administrator";
  const firstInitial = displayName.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="app-grid">
      <aside className="app-sidebar flex min-h-screen flex-col bg-[#102845] px-3 py-5 text-white">
        <Link href="/admin/dashboard" className="mb-8 flex items-center gap-2 px-2 text-white no-underline"><BrandMark size={32} className="rounded-md" /><span className="sidebar-brand-name text-[14px] font-bold">NursePrep</span></Link>
        <p className="sidebar-section-label mb-2 px-3 text-[9px] font-bold uppercase tracking-[.16em] text-[#849bb5]">Administration</p>
        <Suspense fallback={<div className="flex flex-col gap-1">{adminLinks.map(([label, href, glyph]) => <Link key={href} href={href} className="nav-link"><span className="grid w-4 place-items-center">{glyph}</span><span className="nav-label">{adminLabel(label)}</span></Link>)}</div>}><AdminNavigation /></Suspense>
        <Link href="/student-preview" className="mt-auto rounded-md border border-white/10 p-3 text-center text-[10px] font-semibold text-[#ced9e6] no-underline">← <span className="sidebar-footer-copy">Student preview</span></Link>
        <LogoutButton className="mt-3 flex min-h-9 items-center justify-center rounded border border-white/10 px-3 text-[11px] font-bold text-[#ced9e6] hover:bg-white/10">
          Logout
        </LogoutButton>
      </aside>
      <div className="min-w-0">
        <header className="flex h-[64px] items-center justify-between border-b border-[#e5ecf3] bg-white px-5 sm:px-8"><span className="text-[11px] text-[#8190a3]">NursePrep <span className="px-1">/</span> Administration</span><div className="flex items-center gap-3"><span className="hidden text-[11px] font-semibold text-[#354a61] sm:inline">{displayName}</span><span className="grid size-8 place-items-center rounded-full bg-[#eaf0ff] text-[11px] font-bold text-[#385db8]">{firstInitial}</span><LogoutButton className="hidden min-h-8 rounded border border-[#dbe5ef] px-3 text-[10px] font-bold text-[#41576f] sm:inline-flex">Logout</LogoutButton></div></header>
        <main className="main-surface">{children}</main>
      </div>
      <nav className="mobile-bottom-nav admin-mobile-nav" aria-label="Admin quick navigation">
        {adminLinks.map(([label, href, glyph]) => <Link key={href} href={href}><span aria-hidden="true">{glyph}</span>{adminLabel(label)}</Link>)}
      </nav>
    </div>
  );
}
