import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { PageHeading, Panel } from "@/components/ui";

export function InfoPage({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen bg-[#f3f7fb]">
      <header className="flex h-16 items-center justify-between border-b border-[#e3eaf1] bg-white px-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2 text-[14px] font-bold text-[#213a54] no-underline">
          <BrandMark size={28} />
          NursePrep
        </Link>
        <Link href="/login" className="text-[11px] font-semibold text-[#4e61c5] no-underline">
          Login
        </Link>
      </header>
      <section className="mx-auto max-w-4xl px-5 py-12">
        <PageHeading eyebrow="NursePrep" title={title} description={body} />
        <Panel className="p-5 sm:p-7">
          <h2 className="text-[14px] font-bold text-[#2d435a]">Supporting your exam preparation</h2>
          <p className="text-[12px] leading-6 text-[#708197]">
            NursePrep is a study platform for nursing students. Practice questions, mock assessments, and progress records are presented as learning tools and do not replace official guidance from the Nursing and Midwifery Council or your institution.
          </p>
          <h2 className="mt-6 text-[14px] font-bold text-[#2d435a]">Question sources</h2>
          <p className="text-[12px] leading-6 text-[#708197]">
            Past questions are identified by the source information available. When a year or original reference is not present in the supplied material, it is left unspecified. AI-generated practice questions are separate from genuine past questions and require administrator review.
          </p>
          <Link href="/" className="secondary-button mt-3">
            Back to home
          </Link>
        </Panel>
      </section>
    </main>
  );
}
