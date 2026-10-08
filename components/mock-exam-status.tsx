"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startMockExam } from "@/lib/actions/mock-exam";
import { PageHeading, Panel } from "@/components/ui";

const examDurations = [
  { label: "1 hour", seconds: 3600 },
  { label: "90 min", seconds: 5400 },
  { label: "2 hours", seconds: 7200 },
  { label: "3 hours", seconds: 10800 },
  { label: "4 hours", seconds: 14400 },
];

export function MockExamList({ questionCount, setupError }: { questionCount: number; setupError?: string }) {
  const router = useRouter();
  const [duration, setDuration] = useState(10800);
  const [customMinutes, setCustomMinutes] = useState("180");
  const [message, setMessage] = useState(setupError ?? "");
  const [isStarting, setIsStarting] = useState(false);

  async function startExam() {
    setMessage("");
    setIsStarting(true);
    const result = await startMockExam(duration);
    setIsStarting(false);
    if ("error" in result) {
      setMessage(result.error ?? "Could not start the mock exam. Please try again.");
      return;
    }
    router.push(`/student/mock-exam/${result.sessionId}`);
  }

  return (
    <>
      <PageHeading eyebrow="Timed assessment" title="Mock examinations" description="Complete a timed attempt using every approved question in the bank." />
      <div className="grid max-w-[900px] gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,.8fr)]">
        <Panel className="p-5 sm:p-6">
          <p className="m-0 text-[12px] font-bold text-[#30465d]">Time allowed</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {examDurations.map((item) => (
              <button
                key={item.seconds}
                type="button"
                onClick={() => {
                  setDuration(item.seconds);
                  setCustomMinutes(String(item.seconds / 60));
                }}
                aria-pressed={duration === item.seconds}
                className={`min-h-10 rounded-md border px-2 text-[11px] font-bold ${duration === item.seconds ? "border-[#267b69] bg-[#eaf6f1] text-[#1b6b5c]" : "border-[#e2e9f0] bg-white text-[#607287]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label htmlFor="mock-exam-custom-minutes" className="mb-2 mt-4 block text-[11px] font-semibold text-[#607287]">Custom minutes (1-240)</label>
          <input id="mock-exam-custom-minutes" type="number" min="1" max="240" step="1" value={customMinutes} onChange={(event) => {
            const value = event.target.value;
            const minutes = Number(value);
            setCustomMinutes(value);
            setDuration(value && Number.isInteger(minutes) && minutes >= 1 && minutes <= 240 ? minutes * 60 : 0);
          }} className="h-10 w-full max-w-[180px] rounded-md border border-[#dfe7ef] bg-white px-3 text-[12px] text-[#435970] outline-none focus:border-[#267b69]" />
          {message && <p role="alert" className="mt-4 rounded border border-[#f1cccc] bg-[#fff3f3] px-3 py-2 text-[11px] text-[#b64b53]">{message}</p>}
          <button type="button" onClick={startExam} disabled={isStarting || questionCount === 0 || duration < 60} className="primary-button mt-6 disabled:cursor-not-allowed disabled:opacity-50">
            {isStarting ? "Starting exam..." : "Start mock exam"}
          </button>
        </Panel>
        <Panel className="h-fit bg-[#f8fbfd] p-5">
          <p className="eyebrow mb-2">Exam summary</p>
          <h2 className="m-0 text-[16px] font-bold text-[#20364e]">Full approved question bank</h2>
          <div className="mt-5 flex flex-col gap-4 border-t border-[#e8eef4] pt-4">
            <SummaryRow label="Questions" value={String(questionCount)} />
            <SummaryRow label="Time allowed" value={examDurations.find((item) => item.seconds === duration)?.label ?? `${Math.floor(duration / 60)} minutes`} />
            <div className="rounded-md bg-[#edf6f3] p-3 text-[10px] leading-5 text-[#52766d]">
              {questionCount === 0 ? "No approved questions are available yet." : "Answers autosave. Correct answers and your score stay hidden until you submit or time runs out."}
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