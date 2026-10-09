import Link from "next/link";
import type { Profile } from "@/lib/auth/session";
import type { MockExamResultSummary } from "@/lib/actions/mock-exam";
import type { StudentMistake, StudentPracticeSummary } from "@/lib/actions/practice";
import { PageHeading, Panel, ProgressBar, Tag } from "@/components/ui";

export function ProgressPage({ summary, error }: { summary: StudentPracticeSummary | null; error?: string }) {
  return (
    <>
      <PageHeading eyebrow="Your learning journey" title="Progress" description="These figures come from answers and sessions saved to your account. Readiness is not a probability of passing the real exam." />
      {error && <ErrorNotice message={error} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Questions answered" value={String(summary?.questionsAnswered ?? 0)} />
        <Metric label="Accuracy" value={summary?.accuracy === null || summary?.accuracy === undefined ? "—" : `${summary.accuracy}%`} />
        <Metric label="Practice sessions" value={String(summary?.practiceSessions ?? 0)} />
        <Metric label="Completed sessions" value={String(summary?.completedSessions ?? 0)} />
        <Metric label="Study streak" value={`${summary?.studyStreak.currentStreak ?? 0} days`} note={`Best: ${summary?.studyStreak.longestStreak ?? 0} days`} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,.8fr)]">
        <Panel className="p-5">
          <p className="eyebrow mb-1">Saved answers</p><h2 className="section-title m-0">Accuracy by course</h2>
          {summary?.coursePerformance.length ? <div className="mt-5 flex flex-col gap-4">{summary.coursePerformance.map((course) => <div key={course.courseName} className="course-row"><span className="truncate text-[11px] text-[#43586e]">{course.courseName}</span><ProgressBar value={course.accuracy} color={course.accuracy < 60 ? "#ed8e88" : undefined} /><span className="text-right text-[11px] font-bold text-[#40566d]">{course.accuracy}%</span></div>)}</div> : <EmptyNotice title="No course results yet" body="Complete practice questions to see real course accuracy." />}
        </Panel>
        <Panel className="p-5">
          <p className="eyebrow mb-1">Not calculated yet</p><h2 className="section-title m-0">Exam readiness</h2>
          <p className="mt-3 text-[12px] leading-6 text-[#718398]">A preparation indicator will be calculated after a study plan and readiness model are defined. It will describe preparation progress, not predict a real exam result.</p>
          <div className="mt-4 rounded bg-[#edf6f3] p-3 text-[11px] text-[#52766d]">Current streak: {summary?.studyStreak.currentStreak ?? 0} days · Best streak: {summary?.studyStreak.longestStreak ?? 0} days</div>
        </Panel>
      </div>
      <Panel className="mt-3 p-5">
        <div className="mb-3 flex items-center justify-between"><div><p className="eyebrow mb-1">From your account</p><h2 className="section-title m-0">Recent practice sessions</h2></div><Link href="/student/practice" className="text-[11px] font-semibold text-[#4565ce] no-underline">Practice →</Link></div>
        {summary?.recentSessions.length ? <div className="divide-y divide-[#edf1f5]">{summary.recentSessions.map((session) => <div key={session.id} className="flex justify-between gap-3 py-3 text-[11px]"><span className="capitalize text-[#465c72]">{session.questionSet} · {session.questionCount} questions</span><Tag tone={session.status === "completed" ? "green" : "blue"}>{session.status}</Tag></div>)}</div> : <EmptyNotice title="No sessions yet" body="Your completed practice sessions will be listed here." />}
      </Panel>
    </>
  );
}

export function MistakesPage({ mistakes, error }: { mistakes: StudentMistake[]; error?: string }) {
  return <>
    <PageHeading eyebrow="Review from saved answers" title="Mistakes to review" description="Only questions you answered incorrectly or left unanswered are listed." action={<Link href="/student/practice?focus=mistakes" className="primary-button">Practice mistakes →</Link>} />
    {error && <ErrorNotice message={error} />}
    {mistakes.length ? <div className="flex flex-col gap-3">{mistakes.map((mistake) => {
      const wrongAnswerLabel = mistake.selectedOption === null ? "Unanswered" : mistake.options[mistake.selectedOption] ?? "Unknown option";
      const correctAnswerLabel = mistake.options[mistake.correctOption] ?? "Unavailable";

      return <Panel key={mistake.questionId} className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><Tag tone="blue">{mistake.courseName}</Tag><span className="text-[10px] text-[#8492a4]">{mistake.sourceTitle}{mistake.sourceYear ? ` · ${mistake.sourceYear}` : ""}</span></div>
        <h2 className="mt-4 text-[13px] font-semibold leading-6 text-[#2d435a]">{mistake.prompt}</h2>

        <div className="mt-3 flex flex-col gap-1.5">
          {mistake.options.map((option, optionIndex) => {
            const isCorrect = mistake.correctOption === optionIndex;
            const isSelected = mistake.selectedOption === optionIndex;
            const toneClass = isCorrect
              ? "border-[#a6d9c0] bg-[#edf8f2] text-[#197c62]"
              : isSelected
                ? "border-[#edb4b5] bg-[#fff2f2] text-[#a84c51]"
                : "border-[#edf1f5] bg-[#f9fbfd] text-[#64788d]";

            return (
              <div key={`${mistake.questionId}-${optionIndex}`} className={`flex items-start gap-2 rounded border px-3 py-2 text-[11px] ${toneClass}`}>
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[9px] font-bold">
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span className="flex-1 leading-5">{option}</span>
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide">
                  {isCorrect ? "Correct" : isSelected ? "Your answer" : ""}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-2">
          <div className={`rounded p-2.5 ${mistake.selectedOption === null ? "bg-[#f1f3f5] text-[#778595]" : "bg-[#fff0f0] text-[#bf5a60]"}`}>
            <div className="font-bold uppercase tracking-[.08em] text-[9px] opacity-80">Your previous answer</div>
            <div className="mt-1">{wrongAnswerLabel}</div>
          </div>
          <div className="rounded bg-[#eaf8f1] p-2.5 text-[#218368]">
            <div className="font-bold uppercase tracking-[.08em] text-[9px] opacity-80">Correct answer</div>
            <div className="mt-1 font-semibold">{correctAnswerLabel}</div>
          </div>
        </div>

        {mistake.explanation && <p className="mb-0 mt-3 text-[11px] leading-5 text-[#74859a]">{mistake.explanation}</p>}
        <p className="mb-0 mt-3 text-[10px] text-[#8b98a7]">Attempted {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(mistake.attemptedAt))}</p>
      </Panel>;
    })}</div> : <Panel className="p-5"><EmptyNotice title="No mistakes recorded" body="Answer some questions in practice. Incorrect and unanswered items will be collected here." /></Panel>}
  </>;
}

export function AchievementsPage() {
  return <><PageHeading eyebrow="Study milestones" title="Achievements" description="Milestones will appear when the study-streak and XP systems are connected." /><Panel className="max-w-[720px] p-5"><EmptyNotice title="No achievements recorded yet" body="Achievements are not generated from sample data. They will appear after meaningful study activity is connected to the gamification backend." /></Panel></>;
}

export function ProfilePage({ profile }: { profile: Profile }) {
  const joined = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(profile.created_at));
  return <><PageHeading eyebrow="Authenticated account" title="Your profile" description="Profile details are loaded from your Supabase account." /><Panel className="max-w-[720px] p-5"><div className="grid gap-4 sm:grid-cols-2">{[["Full name", profile.full_name || "Not provided"], ["Email", profile.email], ["Role", profile.role], ["Joined", joined]].map(([label, value]) => <div key={label}><p className="eyebrow mb-1">{label}</p><p className="m-0 break-words text-[12px] font-semibold text-[#344a61]">{value}</p></div>)}</div></Panel></>;
}

export function ResultsPage({ results, error }: { results: MockExamResultSummary[]; error?: string }) {
  return (
    <>
      <PageHeading eyebrow="Assessment results" title="Mock exam results" description="Attempts and scores saved to your student account." action={<Link href="/student/mock-exam" className="primary-button">Start mock exam</Link>} />
      {error && <ErrorNotice message={error} />}
      {results.length ? <div className="flex max-w-[900px] flex-col gap-3">{results.map((result) => (
        <Panel key={result.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-[13px] font-bold text-[#2b4158]">Full question bank</h2><Tag tone={result.status === "completed" ? "green" : "blue"}>{result.status === "completed" ? "Completed" : "In progress"}</Tag></div>
            <p className="mb-0 mt-2 text-[10px] text-[#8190a1]">{result.questionCount} questions · {Math.round(result.timeLimitSeconds / 60)} minutes · Started {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.startedAt))}</p>
            {result.status === "completed" && <p className="mb-0 mt-2 text-[11px] text-[#5f7287]">{result.correctCount} correct · {result.answeredCount}/{result.questionCount} answered{result.completedAt ? ` · Submitted ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.completedAt))}` : ""}</p>}
          </div>
          <div className="flex items-center gap-3">
            {result.scorePercent !== null && <strong className="text-[18px] text-[#1f6559]">{result.scorePercent}%</strong>}
            <Link href={`/student/mock-exam/${result.id}`} className="secondary-button">{result.status === "completed" ? "View result" : "Resume"}</Link>
          </div>
        </Panel>
      ))}</div> : <Panel className="max-w-[720px] p-5"><EmptyNotice title="No mock attempts yet" body="Completed and in-progress mock exams will appear here." /><Link href="/student/mock-exam" className="primary-button mt-4">Start mock exam</Link></Panel>}
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <Panel className="stat-card-enter p-4"><p className="eyebrow mb-2">{label}</p><p className="m-0 text-[24px] font-bold text-[#21364e]">{value}</p>{note && <p className="mb-0 mt-1 text-[10px] text-[#8291a3]">{note}</p>}</Panel>;
}

function EmptyNotice({ title, body }: { title: string; body: string }) {
  return <div className="rounded-md border border-dashed border-[#dfe7ef] bg-[#fafcfd] px-4 py-5"><p className="m-0 text-[11px] font-semibold text-[#536980]">{title}</p><p className="mb-0 mt-1 text-[10px] leading-5 text-[#8291a3]">{body}</p></div>;
}

function ErrorNotice({ message }: { message: string }) {
  return <p role="alert" className="mb-3 rounded border border-[#f1cccc] bg-[#fff3f3] px-3 py-2 text-[11px] text-[#b64b53]">{message}</p>;
}