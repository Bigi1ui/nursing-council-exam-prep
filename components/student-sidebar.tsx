import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

const links = [
  ["Dashboard", "/student/dashboard", "▦"],
  ["Practice", "/student/practice", "✎"],
  ["Mock exams", "/student/mock-exam", "◷"],
  ["Results", "/student/results/latest", "▤"],
  ["Progress", "/student/progress", "⌁"],
  ["Mistakes", "/student/mistakes", "↺"],
  ["Bookmarks", "/student/bookmarks", "◇"],
  ["Achievements", "/student/achievements", "✦"],
  ["Profile", "/student/profile", "○"],
];

export function StudentSidebar({ activePath }: { activePath: string }) {
  return (
    <aside className="app-sidebar flex min-h-screen flex-col bg-[#102845] px-3 py-5 text-white">
      <Link href="/student/dashboard" className="mb-8 flex items-center gap-2 px-2 text-white no-underline">
        <span className="grid size-8 place-items-center rounded-md bg-white/10 text-base">✚</span>
        <span className="sidebar-brand-name text-[14px] font-bold tracking-[-.02em]">NursePrep</span>
      </Link>
      <p className="sidebar-section-label mb-2 px-3 text-[9px] font-bold uppercase tracking-[.16em] text-[#849bb5]">Study space</p>
      <nav className="flex flex-col gap-1" aria-label="Student navigation">
        {links.map(([label, href, glyph]) => {
          const active = activePath === href || (href !== "/student/dashboard" && activePath.startsWith(href.split("/").slice(0, 3).join("/")));
          return (
            <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="grid w-4 place-items-center text-[14px]">{glyph}</span>
              <span className="nav-label">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-md border border-white/10 bg-white/[.04] p-3">
        <p className="sidebar-footer-copy mb-2 text-[11px] font-semibold text-white">Keep your rhythm</p>
        <div className="flex items-center justify-center gap-2 text-[11px] text-[#c7d4e3] sm:justify-start">
          <span aria-hidden="true" className="text-[#ffc36b]">✦</span>
          <span className="sidebar-footer-copy">7 day study streak</span>
        </div>
      </div>
      <LogoutButton className="mt-3 flex min-h-9 items-center justify-center rounded border border-white/10 px-3 text-[11px] font-bold text-[#ced9e6] hover:bg-white/10">
        Logout
      </LogoutButton>
    </aside>
  );
}
