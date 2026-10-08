"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startPracticeSession, type PracticeCourse, type PracticeSettings } from "@/lib/actions/practice";
import { PageHeading, Panel } from "@/components/ui";

const questionCounts = [10, 20, 25, 50, 100];
const timeOptions: { label: string; minutes: number | null }[] = [
  { label: "No timer", minutes: null },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
];
const questionSets: { label: string; value: PracticeSettings["questionSet"] }[] = [
  { label: "All questions", value: "all" },
  { label: "Random questions", value: "random" },
  { label: "Weak areas", value: "weak" },
  { label: "Previous mistakes", value: "mistakes" },
  { label: "Bookmarked questions", value: "bookmarks" },
];

export function PracticeBuilder({
  courses,
  availableCount,
  setupError,
}: {
  courses: PracticeCourse[];
  availableCount: number;
  setupError?: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState(20);
  const [courseId, setCourseId] = useState("");
  const [questionSet, setQuestionSet] = useState<PracticeSettings["questionSet"]>("all");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const [customMinutes, setCustomMinutes] = useState("30");
  const [message, setMessage] = useState(setupError ?? "");
  const [isStarting, setIsStarting] = useState(false);
  const courseName = courses.find((course) => course.id === courseId)?.name ?? "All subjects";

  async function startPractice() {
    setMessage("");
    setIsStarting(true);
    const result = await startPracticeSession({ count, courseId: courseId || null, questionSet, timeLimitSeconds: timeLimitMinutes === null ? null : timeLimitMinutes * 60 });
    setIsStarting(false);
    if ("error" in result) {
      setMessage(result.error ?? "Could not start practice. Please try again.");
      return;
    }
    if (!result.sessionId) {
      setMessage("The practice session was not returned. Please try again.");
      return;
    }
    router.push(`/student/practice/${result.sessionId}`);
  }

  return (
    <>
      <PageHeading eyebrow="Database question bank" title="Practice questions" description="Choose an approved past-question set. Your attempt and answers are saved to your account." />
      <div className="grid max-w-[900px] gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(240px,.8fr)]">
        <Panel className="p-5 sm:p-6">
          <p className="text-[12px] font-bold text-[#30465d]">Number of questions</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {questionCounts.map((value) => (
              <button key={value} type="button" onClick={() => setCount(value)} aria-pressed={count === value} className={`min-h-10 rounded-md border text-[12px] font-bold ${count === value ? "border-[#5548e8] bg-[#f2f0ff] text-[#4d41d3]" : "border-[#e2e9f0] bg-white text-[#607287]"}`}>
                {value}
              </button>
            ))}
          </div>
          <label htmlFor="practice-course" className="mb-2 mt-6 block text-[12px] font-bold text-[#30465d]">Course</label>
          <select id="practice-course" value={courseId} onChange={(event) => setCourseId(event.target.value)} className="h-10 w-full rounded-md border border-[#dfe7ef] bg-white px-3 text-[12px] text-[#435970] outline-none focus:border-[#6a60e8]">
            <option value="">All subjects</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
          <p className="mb-2 mt-6 text-[12px] font-bold text-[#30465d]">Question set</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {questionSets.map((item) => (
              <button key={item.value} type="button" onClick={() => setQuestionSet(item.value)} aria-pressed={questionSet === item.value} className={`flex min-h-11 items-center gap-2 rounded-md border px-3 text-left text-[11px] font-semibold ${questionSet === item.value ? "border-[#a8a1ff] bg-[#f6f5ff] text-[#4b44bd]" : "border-[#e5ebf1] bg-white text-[#5d7187]"}`}>
                <span className={`grid size-4 place-items-center rounded-full border ${questionSet === item.value ? "border-[#5548e8] bg-[#5548e8] text-white" : "border-[#c8d2dd]"}`}>{questionSet === item.value ? "✓" : ""}</span>
                {item.label}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-6 text-[12px] font-bold text-[#30465d]">Time limit</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {timeOptions.map((option) => (
              <button key={option.label} type="button" onClick={() => {
                setTimeLimitMinutes(option.minutes);
                if (option.minutes !== null) setCustomMinutes(String(option.minutes));
              }} aria-pressed={timeLimitMinutes === option.minutes} className={`min-h-10 rounded-md border px-2 text-[10px] font-bold ${timeLimitMinutes === option.minutes ? "border-[#267b69] bg-[#eaf6f1] text-[#1b6b5c]" : "border-[#e2e9f0] bg-white text-[#607287]"}`}>
                {option.label}
              </button>
            ))}
          </div>
          <label htmlFor="practice-custom-minutes" className="mb-2 mt-4 block text-[11px] font-semibold text-[#607287]">Custom minutes (1-240)</label>
          <input id="practice-custom-minutes" type="number" min="1" max="240" step="1" value={customMinutes} onChange={(event) => {
            const value = event.target.value;
            setCustomMinutes(value);
            const minutes = Number(value);
            setTimeLimitMinutes(value && Number.isInteger(minutes) && minutes >= 1 && minutes <= 240 ? minutes : null);
          }} className="h-10 w-full max-w-[180px] rounded-md border border-[#dfe7ef] bg-white px-3 text-[12px] text-[#435970] outline-none focus:border-[#267b69]" />
          {message && <p role="alert" className="mt-4 rounded border border-[#f1cccc] bg-[#fff3f3] px-3 py-2 text-[11px] text-[#b64b53]">{message}</p>}
          <button type="button" onClick={startPractice} disabled={isStarting || availableCount === 0} className="primary-button mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            {isStarting ? "Starting..." : "Start practice"} <span aria-hidden="true">→</span>
          </button>
        </Panel>
        <Panel className="h-fit bg-[#f8fbfd] p-5">
          <p className="eyebrow mb-2">Session summary</p>
          <h2 className="m-0 text-[16px] font-bold text-[#20364e]">Practice from the approved bank</h2>
          <div className="mt-5 flex flex-col gap-4 border-t border-[#e8eef4] pt-4">
            <SummaryRow label="Approved questions" value={String(availableCount)} />
            <SummaryRow label="Requested" value={String(count)} />
            <SummaryRow label="Course" value={courseName} />
            <SummaryRow label="Question set" value={questionSets.find((item) => item.value === questionSet)?.label ?? "All questions"} />
            <SummaryRow label="Time limit" value={timeLimitMinutes === null ? "No timer" : `${timeLimitMinutes} minutes`} />
            <div className="rounded-md bg-[#edf6f3] p-3 text-[10px] leading-5 text-[#52766d]">
              {availableCount === 0 ? "No approved past questions are available yet. An administrator must import the supplied source first." : "Your answers autosave. Correct answers and explanations appear after you finish."}
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 text-[11px]"><span className="text-[#74869a]">{label}</span><strong className="max-w-[160px] text-right text-[#31485f]">{value}</strong></div>;
}