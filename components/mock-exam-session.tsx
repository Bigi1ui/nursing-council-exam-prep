"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { finishMockExam, saveMockExamAnswer, type MockExamAnswer, type MockExamSessionData } from "@/lib/actions/mock-exam";
import { PageHeading, Panel, Tag } from "@/components/ui";

export function MockExamSession({ session, error }: { session: MockExamSessionData | null; error?: string }) {
  const [answers, setAnswers] = useState<Record<string, MockExamAnswer>>(session?.answers ?? {});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pendingSaves, setPendingSaves] = useState<Record<string, true>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [complete, setComplete] = useState(session?.status === "completed");
  const [result, setResult] = useState(session?.result ?? null);
  const [message, setMessage] = useState(error ?? "");
  const saveVersions = useRef<Record<string, number>>({});
  const finishStarted = useRef(false);
  const finishHandler = useRef<() => Promise<void>>(async () => {});
  const question = session?.questions[currentIndex];
  const answerValues = Object.values(answers);
  const answeredCount = answerValues.filter((answer) => answer.selectedOption !== null && answer.selectedOption !== undefined).length;
  const reviewCount = answerValues.filter((answer) => answer.markedForReview).length;
  const unansweredCount = Math.max(0, (session?.questions.length ?? 0) - answeredCount);
  const pendingSaveCount = Object.keys(pendingSaves).length;

  function setQuestionPending(questionId: string, pending: boolean) {
    setPendingSaves((current) => {
      if (pending) return current[questionId] ? current : { ...current, [questionId]: true };
      if (!current[questionId]) return current;
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  }

  async function finishExam() {
    if (!session || complete || finishStarted.current) return;
    finishStarted.current = true;
    setIsFinishing(true);
    setMessage("");
    try {
      const response = await finishMockExam(session.id);
      if ("error" in response) {
        finishStarted.current = false;
        setMessage(response.error ?? "Could not submit the exam. Please try again.");
        return;
      }
      setResult(response.result);
      setComplete(true);
      setShowSubmit(false);
    } catch {
      finishStarted.current = false;
      setMessage("Could not submit the exam. Please check your connection and try again.");
    } finally {
      setIsFinishing(false);
    }
  }

  useEffect(() => {
    finishHandler.current = finishExam;
  });

  useEffect(() => {
    if (!session || session.status !== "in_progress" || complete) return;
    const updateRemaining = () => {
      const deadline = Date.parse(session.startedAt) + session.timeLimitSeconds * 1000;
      const nextRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);
      if (nextRemaining === 0) void finishHandler.current();
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [session, complete]);

  async function saveAnswer(selectedOption: number | null, markedForReview: boolean) {
    if (!session || !question || complete || finishStarted.current) return;
    const questionId = question.id;
    const previousAnswer = answers[questionId];
    const requestVersion = (saveVersions.current[questionId] ?? 0) + 1;
    saveVersions.current[questionId] = requestVersion;
    setMessage("");
    setQuestionPending(questionId, true);
    setAnswers((current) => ({ ...current, [questionId]: { selectedOption, markedForReview } }));

    try {
      const response = await saveMockExamAnswer({
        sessionId: session.id,
        questionId,
        selectedOption,
        markedForReview,
      });
      if (saveVersions.current[questionId] !== requestVersion) return;
      if ("error" in response) {
        setMessage(response.error ?? "Could not save this answer. Please try again.");
        setAnswers((current) => {
          if (previousAnswer) return { ...current, [questionId]: previousAnswer };
          const next = { ...current };
          delete next[questionId];
          return next;
        });
        return;
      }
      if (response.expired) {
        setMessage("Time is up. Your saved answers are being submitted.");
        void finishExam();
        return;
      }
      if (!response.saved) setMessage("This exam is no longer accepting answers.");
    } catch {
      if (saveVersions.current[questionId] !== requestVersion) return;
      setMessage("Could not save this answer. Please check your connection and try again.");
      setAnswers((current) => {
        if (previousAnswer) return { ...current, [questionId]: previousAnswer };
        const next = { ...current };
        delete next[questionId];
        return next;
      });
    } finally {
      if (saveVersions.current[questionId] === requestVersion) setQuestionPending(questionId, false);
    }
  }

  if (!session) {
    return (
      <>
        <PageHeading eyebrow="Timed assessment" title="Unable to open exam" description="This attempt could not be loaded from your account." />
        <Panel className="max-w-[700px] p-5">
          <p role="alert" className="m-0 text-[12px] text-[#b64b53]">{error || "Mock exam not found."}</p>
          <Link href="/student/mock-exam" className="primary-button mt-4">Back to mock exams</Link>
        </Panel>
      </>
    );
  }

  if (session.questions.length === 0) {
    return <><PageHeading eyebrow="Timed assessment" title="No questions in this exam" /><Panel className="p-5"><p className="m-0 text-[12px] text-[#64788d]">This attempt has no available questions.</p></Panel></>;
  }

  if (complete) {
    const percentage = result?.questionCount ? Math.round((result.correctCount / result.questionCount) * 100) : 0;
    return (
      <>
        <PageHeading eyebrow="Exam submitted" title="Mock exam result" description={`${result?.correctCount ?? 0} correct out of ${result?.questionCount ?? session.questions.length}`} />
        <Panel className="max-w-[640px] p-5 sm:p-7">
          <div className="grid grid-cols-3 gap-3 text-center">
            <ResultValue label="Score" value={`${percentage}%`} />
            <ResultValue label="Correct" value={String(result?.correctCount ?? 0)} />
            <ResultValue label="Answered" value={`${result?.answeredCount ?? 0}/${result?.questionCount ?? session.questions.length}`} />
          </div>
          <div className="mt-5 border-t border-[#e8eef4] pt-4 text-[11px] text-[#718398]">
            <p className="m-0">{result?.questionCount ? result.questionCount - (result.answeredCount ?? 0) : 0} questions were left unanswered.</p>
            {session.completedAt && <p className="mb-0 mt-2">Submitted {new Date(session.completedAt).toLocaleString()}</p>}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/student/mistakes" className="primary-button">Review mistakes</Link>
            <Link href="/student/mock-exam" className="secondary-button">Back to mock exams</Link>
          </div>
        </Panel>
      </>
    );
  }

  if (!question) return <Panel className="p-5"><p role="alert" className="m-0 text-[12px] text-[#b64b53]">This exam does not contain a question at the selected position.</p></Panel>;

  const savedAnswer = answers[question.id];
  const currentSaving = Boolean(pendingSaves[question.id]);
  const timerLabel = remainingSeconds === null ? "--:--" : formatDuration(remainingSeconds);

  return (
    <div className="-mx-3 -mt-3 min-h-[calc(100vh-64px)] rounded-lg bg-[#eff4f8] p-3 sm:-mx-5 sm:-mt-5 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-[#102845] px-4 py-3 text-white">
        <div><p className="m-0 text-[12px] font-bold">NursePrep <span className="font-normal text-[#a8bdd3]">/ Mock examination</span></p><p className="mb-0 mt-1 text-[10px] text-[#a8bdd3]">All approved questions</p></div>
        <div className="flex items-center gap-3">
          <Tag tone={pendingSaveCount > 0 ? "orange" : "green"}>{pendingSaveCount > 0 ? "Saving answers..." : "Answers saved"}</Tag>
          <div aria-live="polite" className={`min-w-[84px] rounded border px-3 py-2 text-center font-mono text-[14px] font-bold tabular-nums ${remainingSeconds !== null && remainingSeconds <= 300 ? "border-[#f3a4a4] bg-[#7f3037] text-white" : "border-[#7890aa] bg-[#1b3856] text-white"}`}>
            {timerLabel}
          </div>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_270px]">
        <Panel className="min-h-[470px] p-5 sm:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-[#e8edf2] pb-4">
            <div><p className="eyebrow mb-1">{question.courseName}</p><p className="m-0 text-[11px] text-[#8491a2]">Question {currentIndex + 1} of {session.questions.length}{currentSaving ? " - saving" : ""}</p></div>
            <button type="button" onClick={() => void saveAnswer(savedAnswer?.selectedOption ?? null, !savedAnswer?.markedForReview)} disabled={currentSaving} className={`rounded border px-3 py-2 text-[10px] font-semibold disabled:opacity-50 ${savedAnswer?.markedForReview ? "border-[#f0c873] bg-[#fff8e8] text-[#a97720]" : "border-[#e0e7ee] text-[#6e7f93]"}`}>
              {savedAnswer?.markedForReview ? "Marked for review" : "Mark for review"}
            </button>
          </div>
          <p className="max-w-3xl text-[16px] font-semibold leading-7 text-[#253a51]">{question.prompt}</p>
          <div className="mt-6 flex max-w-3xl flex-col gap-2.5">
            {question.options.map((option, index) => {
              const selected = savedAnswer?.selectedOption === index;
              return (
                <button key={`${question.id}-${index}`} type="button" onClick={() => void saveAnswer(index, savedAnswer?.markedForReview ?? false)} aria-pressed={selected} disabled={currentSaving || isFinishing} className={`flex min-h-12 items-center gap-3 rounded-md border px-3 text-left text-[12px] disabled:cursor-wait disabled:opacity-70 ${selected ? "border-[#267b69] bg-[#eaf6f1] text-[#1b6b5c]" : "border-[#e3eaf0] bg-white text-[#465c72] hover:border-[#aab8c8]"}`}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-current text-[10px] font-bold">{String.fromCharCode(65 + index)}</span>{option}
                </button>
              );
            })}
          </div>
          {savedAnswer?.selectedOption !== null && savedAnswer?.selectedOption !== undefined && <button type="button" onClick={() => void saveAnswer(null, savedAnswer.markedForReview)} disabled={currentSaving} className="mt-3 text-[10px] font-semibold text-[#6d7f93] underline underline-offset-2 disabled:opacity-50">Clear answer</button>}
          {message && <p role="alert" className="mt-4 rounded border border-[#f1cccc] bg-[#fff3f3] px-3 py-2 text-[11px] text-[#b64b53]">{message}</p>}
          <div className="mt-8 flex flex-wrap justify-between gap-2 border-t border-[#edf1f5] pt-4">
            <button type="button" onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))} disabled={currentIndex === 0} className="secondary-button disabled:opacity-40">Previous</button>
            <button type="button" onClick={() => setCurrentIndex((value) => Math.min(session.questions.length - 1, value + 1))} disabled={currentIndex === session.questions.length - 1} className="primary-button disabled:opacity-50">Next question</button>
          </div>
        </Panel>
        <Panel className="h-fit p-4">
          <div className="mb-4"><h2 className="section-title m-0">Question navigator</h2><p className="mb-0 mt-1 text-[10px] text-[#8291a3]">Choose a question</p></div>
          <div className="mb-4 grid max-h-[320px] grid-cols-6 gap-1.5 overflow-y-auto sm:grid-cols-8 xl:grid-cols-5">
            {session.questions.map((item, index) => {
              const answer = answers[item.id];
              const answered = answer?.selectedOption !== null && answer?.selectedOption !== undefined;
              return <button type="button" key={item.id} aria-label={`Question ${index + 1}${answered ? ", answered" : ", unanswered"}${answer?.markedForReview ? ", marked for review" : ""}`} onClick={() => setCurrentIndex(index)} className={`aspect-square rounded text-[9px] font-bold transition-colors duration-100 ${index === currentIndex ? "bg-[#267b69] text-white" : answer?.markedForReview ? "bg-[#fff0cf] text-[#956616]" : answered ? "bg-[#dcefe8] text-[#1b6b5c]" : "bg-[#f0f3f6] text-[#6c7d91]"}`}>{index + 1}</button>;
            })}
          </div>
          <div className="grid grid-cols-3 gap-1 border-t border-[#edf1f5] pt-3 text-center"><div><p className="m-0 text-[15px] font-bold text-[#27866b]">{answeredCount}</p><p className="mb-0 mt-1 text-[9px] text-[#8492a3]">Answered</p></div><div><p className="m-0 text-[15px] font-bold text-[#697c91]">{unansweredCount}</p><p className="mb-0 mt-1 text-[9px] text-[#8492a3]">Unanswered</p></div><div><p className="m-0 text-[15px] font-bold text-[#be8a2d]">{reviewCount}</p><p className="mb-0 mt-1 text-[9px] text-[#8492a3]">Review</p></div></div>
          <button type="button" onClick={() => setShowSubmit(true)} disabled={isFinishing || pendingSaveCount > 0} className="mt-4 min-h-10 w-full rounded-md bg-[#d84f50] text-[11px] font-bold text-white hover:bg-[#c84345] disabled:cursor-not-allowed disabled:opacity-60">
            {isFinishing ? "Submitting..." : pendingSaveCount > 0 ? "Saving answers..." : "Submit exam"}
          </button>
        </Panel>
      </div>
      {showSubmit && <div className="fixed inset-0 z-50 grid place-items-center bg-[#10243b]/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="finish-title" className="w-full max-w-[390px] rounded-lg bg-white p-6 shadow-xl"><h2 id="finish-title" className="mt-0 text-center text-[18px] font-bold text-[#20354d]">Submit this mock exam?</h2><p className="mt-2 text-center text-[12px] leading-5 text-[#728399]">{unansweredCount > 0 ? `${unansweredCount} question${unansweredCount === 1 ? " is" : "s are"} unanswered. Submit your saved answers now?` : "All questions are answered. Submit and view your result?"}</p><div className="mt-5 flex justify-center gap-2"><button type="button" onClick={() => setShowSubmit(false)} className="secondary-button">Keep working</button><button type="button" disabled={isFinishing || pendingSaveCount > 0} onClick={() => void finishExam()} className="primary-button disabled:cursor-not-allowed disabled:opacity-60">{isFinishing ? "Submitting..." : "Submit exam"}</button></div></section></div>}
    </div>
  );
}

function ResultValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-[#f4f7fa] p-4"><p className="m-0 text-[20px] font-bold text-[#1f6559]">{value}</p><p className="mb-0 mt-1 text-[10px] text-[#78899b]">{label}</p></div>;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}