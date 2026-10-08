import Link from "next/link";
import type { Profile } from "@/lib/auth/session";
import type { StudentPracticeSummary } from "@/lib/actions/practice";
import { PageHeading, Panel, ProgressBar, Tag } from "@/components/ui";

export function LiveStudentDashboard({
  profile,
  summary,
  error,
  preview = false,
}: {
  profile: Profile;
  summary: StudentPracticeSummary | null;
  error?: string;
  preview?: boolean;
}) {
  const displayName = profile.full_name || profile.email;
  const createdDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(profile.created_at));
  const weakestCourses = [...(summary?.coursePerformance ?? [])].filter((course) => course.answered > 0).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  const coursePerformance = summary?.coursePerformance ?? [];
  const stats = preview ? [
    { label: "Questions answered", value: "—", note: "Not shown in preview" },
    { label: "Accuracy", value: "—", note: "Not shown in preview" },
    { label: "Practice sessions", value: "—", note: "Not shown in preview" },
    { label: "Study streak", value: "—", note: "Not shown in preview" },
  ] : [
    { label: "Questions answered", value: String(summary?.questionsAnswered ?? 0), note: "Saved practice answers" },
    { label: "Accuracy", value: summary?.accuracy === null || summary?.accuracy === undefined ? "—" : `${summary.accuracy}%`, note: summary?.questionsAnswered ? `${summary.correctAnswers} correct` : "Available after practice" },
    { label: "Practice sessions", value: String(summary?.practiceSessions ?? 0), note: `${summary?.completedSessions ?? 0} completed` },
    { label: "Study streak", value: `${summary?.studyStreak.currentStreak ?? 0} days`, note: `Best: ${summary?.studyStreak.longestStreak ?? 0} days` },
  ];

  return (
    <>
      <PageHeading eyebrow={preview ? "Student preview" : "Student dashboard"} title={preview ? "Student dashboard preview" : `Welcome back, ${displayName}`} description={preview ? "Read-only preview. Student account details and activity are hidden." : "Your profile, practice activity, and study streak are loaded from your account."} action={preview ? undefined : <Link className="secondary-button" href="/student/profile">View profile</Link>} />
      {!preview && <Panel className="mb-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProfileFact label="Full name" value={profile.full_name || "Not provided"} />
          <ProfileFact label="Email" value={profile.email} />
          <ProfileFact label="Role" value={profile.role} />
          <ProfileFact label="Account created" value={createdDate} />
        </div>
      </Panel>}

      {error && <p role="status" className="mb-3 rounded border border-[#f0dfb8] bg-[#fffbf2] px-4 py-3 text-[11px] text-[#806739]">Practice data is temporarily unavailable: {error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => <Panel key={stat.label} className="stat-card-enter p-4" style={{ animationDelay: `${index * 65}ms` }}>
          <p className="eyebrow mb-2">{stat.label}</p>
          <p className="m-0 text-[24px] font-bold text-[#21364e]">{stat.value}</p>
          <p className="mb-0 mt-1 text-[10px] text-[#8291a3]">{stat.note}</p>
        </Panel>)}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
        <Panel className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="eyebrow mb-1">Learning overview</p><h2 className="section-title m-0">Course accuracy</h2></div>
            {!preview && <Link className="text-[11px] font-semibold text-[#4565ce] no-underline" href="/student/progress">Progress details →</Link>}
          </div>
          {coursePerformance.length ? <div className="flex flex-col gap-4">
            {coursePerformance.map((course) => <div key={course.courseName} className="course-row">
              <span className="truncate text-[11px] font-medium text-[#41566d]">{course.courseName}</span>
              <ProgressBar value={course.accuracy} color={course.accuracy < 60 ? "#ed8e88" : undefined} />
              <span className="text-right text-[11px] font-bold text-[#344b62]">{course.accuracy}%</span>
            </div>)}
          </div> : <EmptyMessage title={preview ? "Progress data hidden" : "No course data yet"} body={preview ? "Student activity is not included in this preview." : "Answer approved past questions to see course accuracy here."} />}
        </Panel>

        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between"><div><p className="eyebrow mb-1">Based on saved answers</p><h2 className="section-title m-0">Weak areas</h2></div><Tag tone="gray">{weakestCourses.length} courses</Tag></div>
          {weakestCourses.length ? <div className="flex flex-col gap-3">
            {weakestCourses.map((course) => <div key={course.courseName} className="flex items-center justify-between gap-3 border-b border-[#edf1f5] pb-3 last:border-0 last:pb-0"><span className="text-[11px] text-[#42576d]">{course.courseName}</span><Tag tone={course.accuracy < 60 ? "red" : "orange"}>{course.accuracy}%</Tag></div>)}
            <Link className="primary-button mt-1 w-full" href="/student/practice?focus=weak">Practice weak areas</Link>
          </div> : <EmptyMessage title={preview ? "Weak areas hidden" : "Not enough practice data"} body={preview ? "Student activity is not included in this preview." : "Answer questions across courses to identify which topics need attention."} />}
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between"><div><p className="eyebrow mb-1">{preview ? "Student account" : "Saved to your account"}</p><h2 className="section-title m-0">Recent practice sessions</h2></div>{!preview && <Link href="/student/practice" className="text-[11px] font-semibold text-[#4565ce] no-underline">Practice →</Link>}</div>
          {preview ? <EmptyMessage title="Practice history hidden" body="The preview does not access student records." /> : summary?.recentSessions.length ? <div className="flex flex-col divide-y divide-[#edf1f5]">
            {summary.recentSessions.map((session) => <div key={session.id} className="flex items-center justify-between gap-3 py-3 first:pt-1"><div><p className="m-0 text-[11px] font-semibold capitalize text-[#34495f]">{session.questionSet.replaceAll("_", " ")} practice</p><p className="mb-0 mt-1 text-[10px] text-[#8997a8]">{session.questionCount} questions · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.startedAt))}</p></div><Tag tone={session.status === "completed" ? "green" : "blue"}>{session.status}</Tag></div>)}
          </div> : <EmptyMessage title="No sessions yet" body="Start a practice session and it will appear here." />}
        </Panel>

        <Panel className="p-5">
          <p className="eyebrow mb-1">Not connected yet</p>
          <h2 className="section-title m-0">Preparation indicators</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <UnavailableMetric label="Exam readiness" detail="Requires a defined preparation model" />
            {preview ? <UnavailableMetric label="Study streak" detail="Student activity is hidden in preview" /> : <StreakMetric current={summary?.studyStreak.currentStreak ?? 0} best={summary?.studyStreak.longestStreak ?? 0} />}
            <UnavailableMetric label="XP and achievements" detail="Gamification backend is not connected" />
          </div>
          <p className="mb-0 mt-4 text-[10px] leading-5 text-[#8291a3]">Exam readiness will represent preparation progress, not the probability of passing the official examination.</p>
        </Panel>
      </div>
    </>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return <div><p className="eyebrow mb-1">{label}</p><p className="m-0 break-words text-[13px] font-semibold capitalize text-[#273f58]">{value}</p></div>;
}

function EmptyMessage({ title, body }: { title: string; body: string }) {
  return <div className="rounded-md border border-dashed border-[#dfe7ef] bg-[#fafcfd] px-4 py-5"><p className="m-0 text-[11px] font-semibold text-[#536980]">{title}</p><p className="mb-0 mt-1 text-[10px] leading-5 text-[#8291a3]">{body}</p></div>;
}

function UnavailableMetric({ label, detail }: { label: string; detail: string }) {
  return <div className="rounded-md bg-[#f5f8fa] p-3"><p className="m-0 text-[10px] font-semibold text-[#5d7287]">{label}</p><p className="mb-0 mt-2 text-[11px] font-bold text-[#9aa6b3]">Not available</p><p className="mb-0 mt-1 text-[9px] leading-4 text-[#8997a8]">{detail}</p></div>;
}

function StreakMetric({ current, best }: { current: number; best: number }) {
  return <div className="rounded-md bg-[#edf6f3] p-3"><p className="m-0 text-[10px] font-semibold text-[#52766d]">Study streak</p><p className="mb-0 mt-2 text-[17px] font-bold text-[#1f6559]">{current} {current === 1 ? "day" : "days"}</p><p className="mb-0 mt-1 text-[9px] leading-4 text-[#66857d]">Best: {best} {best === 1 ? "day" : "days"}</p></div>;
}