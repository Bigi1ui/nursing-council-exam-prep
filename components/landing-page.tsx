import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Panel } from "@/components/ui";

const platformFeatures = [
  {
    title: "Authentic past questions",
    text: "Keep official past-question practice separate from AI-generated or instructor-created practice content.",
  },
  {
    title: "CBT practice",
    text: "Practice in a focused computer-based format that supports timing, review, and steady repetition.",
  },
  {
    title: "250-question mock exams",
    text: "Prepare for long-form sessions with full mock exams built around a realistic question load.",
  },
  {
    title: "3-hour mock exam",
    text: "Train pacing, endurance, and concentration with a timed three-hour assessment experience.",
  },
  {
    title: "Detailed corrections",
    text: "Review mistakes with explanations so each missed question becomes a study opportunity.",
  },
  {
    title: "Weak-area practice",
    text: "Identify courses and topics that need attention, then return to them with focused practice.",
  },
  {
    title: "Achievements and study streaks",
    text: "Use light motivation, XP, streaks, and milestones to make consistent study easier to maintain.",
  },
  {
    title: "Exam readiness",
    text: "Readiness is a preparation indicator based on practice activity, not a guarantee of examination success.",
  },
];

const workflowSteps = [
  ["Create your account", "Start with a student profile and a private preparation workspace."],
  ["Practice by course", "Answer questions, bookmark difficult items, and review detailed corrections."],
  ["Take mock exams", "Sit a 250-question, three-hour CBT-style mock when you are ready."],
  ["Track progress", "Use accuracy, streaks, mistakes, and weak-area trends to plan the next session."],
];

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f3f7fb]">
      <header className="absolute inset-x-0 top-0 z-10 flex h-[72px] items-center justify-between px-5 text-white sm:px-10 lg:px-16">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-bold text-white no-underline">
          <BrandMark size={32} className="rounded" />
          NursePrep
        </Link>
        <nav className="hidden items-center gap-7 text-[11px] font-semibold sm:flex" aria-label="Public navigation">
          <Link href="/" className="text-white no-underline">Home</Link>
          <Link href="/about" className="text-white/90 no-underline">About</Link>
          <Link href="/contact" className="text-white/90 no-underline">Contact</Link>
          <Link href="/student/dashboard" className="rounded border border-white/50 px-4 py-2 text-white no-underline">Login</Link>
          <Link href="/register" className="rounded bg-[#5548e8] px-4 py-2 text-white no-underline">Create Account</Link>
        </nav>
        <Link href="/student/dashboard" className="text-[11px] font-semibold text-white no-underline sm:hidden">Login</Link>
      </header>

      <section
        className="relative flex min-h-[680px] items-center overflow-hidden bg-[#17324d] bg-cover bg-center px-5 pb-14 pt-24 sm:px-10 lg:px-16"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgb(11 35 59 / 92%) 0%, rgb(11 35 59 / 76%) 46%, rgb(11 35 59 / 18%) 100%), url('https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=2200&q=85')",
        }}
      >
        <div className="relative z-[1] max-w-[690px] animate-[fade-in_.65s_ease-out_both] text-white">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[.16em] text-[#9de1cf]">
            Nursing Council exam preparation
          </p>
          <h1 className="max-w-[680px] text-[38px] font-bold leading-[1.08] tracking-[-.03em] sm:text-[56px]">
            Prepare Smarter. Practice Harder. Pass With Confidence.
          </h1>
          <p className="mt-5 max-w-[600px] text-[14px] leading-7 text-white/82">
            A professional platform for nursing students to practice past questions, take CBT mock exams, identify weak areas, review mistakes and track their preparation.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/student/practice" className="primary-button min-h-11">Start Practicing</Link>
            <Link href="/student/dashboard" className="inline-flex min-h-11 items-center rounded border border-white/50 px-5 text-[12px] font-semibold text-white no-underline">Login</Link>
            <Link href="/register" className="secondary-button min-h-11 border-white/60 bg-white/10 text-white">Create Account</Link>
          </div>
          <p className="mt-7 max-w-[560px] rounded border border-white/15 bg-white/10 px-4 py-3 text-[11px] leading-5 text-white/76">
            Exam readiness scores are preparation indicators based on practice data. They are not guarantees of success in the real examination.
          </p>
        </div>
      </section>

      <section className="relative mx-auto -mt-10 grid max-w-6xl gap-3 px-4 pb-8 sm:grid-cols-3">
        <Feature title="Why use the platform" text="A structured study space for practice, corrections, mock exams, progress review, and repeatable exam habits." />
        <Feature title="Progress tracking" text="See temporary and real preparation metrics clearly as the backend grows, without pretending every statistic is live." />
        <Feature title="Nursing focused" text="Built around nursing courses, past-question review, CBT discipline, and practical exam preparation workflows." />
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="mb-6 max-w-2xl">
          <p className="eyebrow mb-2">Core preparation tools</p>
          <h2 className="m-0 text-[26px] font-bold tracking-[-.02em] text-[#182b43]">Everything needed for steady, honest preparation</h2>
          <p className="mt-3 text-[13px] leading-6 text-[#6f8095]">
            The goal is not a fake promise. It is clear practice, better review, and a reliable view of where your preparation needs more attention.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {platformFeatures.map((feature) => (
            <Feature key={feature.title} title={feature.title} text={feature.text} />
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-white py-12">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <p className="eyebrow mb-2">How it works</p>
          <h2 className="m-0 text-[25px] font-bold tracking-[-.02em] text-[#182b43]">A simple loop for better exam habits</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {workflowSteps.map(([title, text], index) => (
              <Step key={title} index={index + 1} title={title} text={text} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="p-6 sm:p-8">
          <p className="eyebrow mb-2">Call to action</p>
          <h2 className="m-0 max-w-2xl text-[26px] font-bold tracking-[-.02em] text-[#182b43]">
            Start with focused practice, then build up to a full timed mock exam.
          </h2>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#6f8095]">
            Use past questions, corrections, weak-area practice, and progress trends to guide your study plan with more confidence.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/register" className="primary-button">Create Account</Link>
            <Link href="/student/dashboard" className="secondary-button">Login</Link>
          </div>
        </Panel>
        <Panel className="border-[#dcece8] bg-[#f7fffc] p-6">
          <p className="eyebrow mb-2 !text-[#168468]">Exam readiness</p>
          <p className="m-0 text-[32px] font-bold tracking-[-.04em] text-[#17324d]">Indicator</p>
          <p className="mt-3 text-[12px] leading-6 text-[#60758a]">
            Readiness summarizes preparation activity and practice performance. It does not predict or guarantee the outcome of the official examination.
          </p>
        </Panel>
      </section>

      <footer className="border-t border-[#e1eaf3] bg-white px-5 py-6 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <p className="m-0 text-[11px] font-semibold text-[#30465e]">NursePrep</p>
          <nav className="flex flex-wrap gap-4 text-[10px] text-[#718398]" aria-label="Footer navigation">
            <Link href="/">Home</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-md border border-[#e1e9f0] bg-white p-4 shadow-[0_6px_18px_rgb(22_53_82/.05)]">
      <h3 className="mb-1 mt-0 text-[13px] font-bold text-[#2a4159]">{title}</h3>
      <p className="m-0 text-[11px] leading-5 text-[#7e8da0]">{text}</p>
    </article>
  );
}

function Step({ index, title, text }: { index: number; title: string; text: string }) {
  return (
    <article className="rounded-md border border-[#e1e9f0] bg-[#f8fbfd] p-4">
      <span className="grid size-8 place-items-center rounded bg-[#e8f6f2] text-[12px] font-bold text-[#168468]">
        {index}
      </span>
      <h3 className="mb-1 mt-4 text-[13px] font-bold text-[#2a4159]">{title}</h3>
      <p className="m-0 text-[11px] leading-5 text-[#7e8da0]">{text}</p>
    </article>
  );
}
