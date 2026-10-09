import Image from "next/image";
import Link from "next/link";
import type { ReadinessSummary, StudentGamificationSummary } from "@/lib/actions/gamification";
import { Panel, ProgressBar, Tag } from "@/components/ui";

const componentLabels = [
  ["accuracy", "Question accuracy"],
  ["mockPerformance", "Full mock performance"],
  ["courseCoverage", "Course coverage"],
  ["consistency", "Study consistency"],
  ["improvement", "Improvement"],
] as const;

export function XpLevelPanel({ summary }: { summary: StudentGamificationSummary }) {
  const remainingXp = summary.nextLevelXp === null ? 0 : Math.max(0, summary.nextLevelXp - summary.totalXp);
  const xpIntoLevel = Math.max(0, summary.totalXp - summary.levelFloorXp);
  const levelSpan = summary.nextLevelXp === null ? null : summary.nextLevelXp - summary.levelFloorXp;

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Study rewards</p>
          <h2 className="m-0 text-[20px] font-bold text-[#20364e]">Level {summary.level} · {summary.levelTitle}</h2>
        </div>
        <Tag tone="green">{summary.totalXp.toLocaleString()} XP</Tag>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-[10px] text-[#73869a]">
        <span>{levelSpan === null ? `${summary.totalXp.toLocaleString()} XP total` : `${xpIntoLevel.toLocaleString()} / ${levelSpan.toLocaleString()} XP this level`}</span>
        <span>{summary.nextLevelXp === null ? "Maximum level" : `${remainingXp.toLocaleString()} XP to next level`}</span>
      </div>
      <div className="mt-2"><ProgressBar value={summary.levelProgress} color="#12a58b" /></div>
    </Panel>
  );
}

export function ReadinessPanel({ readiness, history = [], compact = false }: {
  readiness: ReadinessSummary;
  history?: StudentGamificationSummary["readinessHistory"];
  compact?: boolean;
}) {
  const score = readiness.score;
  const evidence = readiness.evidence;
  const missing = [
    evidence.practiceQuestions < 100 ? "100 completed practice answers" : null,
    evidence.coursesAnswered < Math.min(2, evidence.activeCourses) ? "practice across multiple courses" : null,
    evidence.coursesCovered < Math.min(3, evidence.activeCourses) ? "10 answers in at least three active courses" : null,
    evidence.fullMockExams < 1 ? "a completed 250+ question mock exam" : null,
    evidence.comparableAssessments < 1 ? "two comparable completed assessments" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Performance model · not a pass prediction</p>
          <h2 className="section-title m-0">Exam Readiness</h2>
        </div>
        {score === null ? <Tag tone="orange">Building baseline</Tag> : <Tag tone={score >= 76 ? "green" : "blue"}>{readiness.label}</Tag>}
      </div>

      {score === null ? (
        <div className="mt-4 rounded-md border border-dashed border-[#dfe7ef] bg-[#fafcfd] p-4">
          <p className="m-0 text-[14px] font-bold text-[#344a61]">Not enough data yet</p>
          <p className="mb-0 mt-1 text-[11px] leading-5 text-[#72849a]">Readiness appears after enough completed work establishes a reliable baseline.</p>
          {missing.length > 0 && <ul className="mb-0 mt-3 space-y-1 pl-4 text-[10px] text-[#60758a]">{missing.map((item) => <li key={item}>Still needed: {item}</li>)}</ul>}
        </div>
      ) : (
        <div className="mt-3 flex items-end gap-3">
          <p className="m-0 text-[42px] font-bold leading-none text-[#173b56]">{score}<span className="text-[21px]">%</span></p>
          <div className="mb-1 flex-1"><ProgressBar value={score} color="#12a58b" /></div>
        </div>
      )}

      {!compact && <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {componentLabels.map(([key, label]) => {
            const value = readiness.components[key];
            return <div key={key} className="border-b border-[#edf1f5] pb-2">
              <div className="mb-1 flex justify-between gap-3 text-[10px]"><span className="text-[#64788d]">{label}</span><strong className="text-[#30465d]">{value === null ? "Not measured" : `${value}%`}</strong></div>
              {value !== null && <ProgressBar value={value} color={value < 60 ? "#e58b83" : undefined} />}
            </div>;
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-[#718398] sm:grid-cols-4">
          <Evidence label="Practice answers" value={evidence.practiceQuestions} />
          <Evidence label="Courses covered" value={`${evidence.coursesCovered}/${evidence.activeCourses}`} />
          <Evidence label="Full mock exams" value={evidence.fullMockExams} />
          <Evidence label="Comparable results" value={evidence.comparableAssessments} />
        </div>
        {readiness.weakCourses.length > 0 && <div className="mt-4 rounded-md bg-[#fff5f1] p-3">
          <p className="m-0 text-[10px] font-bold text-[#985a45]">Courses to revisit</p>
          <div className="mt-2 flex flex-wrap gap-2">{readiness.weakCourses.map((course) => <Tag key={course.courseName} tone="red">{course.courseName} · {course.accuracy}%</Tag>)}</div>
        </div>}
        {history.length > 1 && <div className="mt-5">
          <p className="eyebrow mb-2">Readiness history</p>
          <div className="flex h-20 items-end gap-1.5 border-b border-[#dfe7ef] px-1">
            {history.slice(-14).map((entry) => <div key={entry.date} title={`${entry.date}: ${entry.score}%`} className="min-w-1 flex-1 rounded-t-sm bg-[#22a88d]" style={{ height: `${Math.max(5, entry.score)}%` }} />)}
          </div>
          <p className="mb-0 mt-1 text-right text-[9px] text-[#8997a8]">Most recent score per UTC day</p>
        </div>}
      </>}
      {compact && <p className="mb-0 mt-3 text-[10px] leading-5 text-[#8291a3]">Measured from practice accuracy, completed full mocks, course coverage, study consistency and improvement. XP does not affect this score.</p>}
    </Panel>
  );
}

export function AchievementGrid({ summary, limit }: { summary: StudentGamificationSummary; limit?: number }) {
  const achievements = limit ? summary.achievements.slice(0, limit) : summary.achievements;
  const unlockedCount = summary.achievements.filter((item) => item.unlockedAt).length;

  return <>
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div><p className="eyebrow mb-1">Milestones</p><h2 className="section-title m-0">Achievements</h2></div>
      <span className="text-[10px] font-semibold text-[#718398]">{unlockedCount} of {summary.achievements.length} earned</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {achievements.map((achievement) => {
        const unlocked = Boolean(achievement.unlockedAt);
        return <article key={achievement.key} className={`flex min-h-[126px] items-center gap-3 rounded-md border p-3 ${unlocked ? "border-[#cde9df] bg-[#f5fcf9]" : "border-[#e4eaf0] bg-[#fafcfd]"}`}>
          <Image src={achievement.iconPath} alt="" width={64} height={64} className={`size-16 shrink-0 ${unlocked ? "" : "grayscale opacity-40"}`} />
          <div className="min-w-0">
            <h3 className="m-0 text-[12px] font-bold text-[#2a4159]">{achievement.name}</h3>
            <p className="mb-1 mt-1 text-[10px] leading-4 text-[#75869a]">{achievement.description}</p>
            <p className={`m-0 text-[9px] font-bold ${unlocked ? "text-[#168468]" : "text-[#8c9aaa]"}`}>
              {unlocked ? `Earned · +${achievement.xpReward} XP` : `Locked · +${achievement.xpReward} XP`}
            </p>
          </div>
        </article>;
      })}
    </div>
    {limit && <Link href="/student/achievements" className="mt-3 inline-flex text-[11px] font-semibold text-[#168468] no-underline">View all achievements →</Link>}
  </>;
}

function Evidence({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded bg-[#f6f9fb] p-2"><p className="m-0">{label}</p><strong className="mt-1 block text-[13px] text-[#344a61]">{value}</strong></div>;
}