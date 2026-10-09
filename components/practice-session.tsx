"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { savePracticeAnswer, finishPracticeSession, type PracticeSessionData, type SavedPracticeAnswer } from "@/lib/actions/practice";
import { claimAttemptReviewXp } from "@/lib/actions/gamification";
import { PageHeading, Panel, Tag } from "@/components/ui";

export function PracticeSession({ session, error }: { session: PracticeSessionData | null; error?: string }) {
  const [answers, setAnswers] = useState<Record<string, SavedPracticeAnswer>>(session?.answers ?? {});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pendingSaves, setPendingSaves] = useState<Record<string, true>>({});
  const saveVersions = useRef<Record<string, number>>({});
  const [showSubmit, setShowSubmit] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [complete, setComplete] = useState(session?.status === "completed");
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [finishRequested, setFinishRequested] = useState(false);
  const [message, setMessage] = useState(error ?? "");
  const [reviewMessage, setReviewMessage] = useState("");
  const [isClaimingReviewXp, setIsClaimingReviewXp] = useState(false);
  const finishStarted = useRef(false);
  const finishHandler = useRef<() => Promise<void>>(async () => {});
  const question = session?.questions[currentIndex];
  const answerValues = useMemo(() => Object.values(answers), [answers]);
  const answeredCount = answerValues.filter((answer) => answer.selectedOption !== null && answer.selectedOption !== undefined).length;
  const reviewCount = answerValues.filter((answer) => answer.markedForReview).length;
  const unansweredCount = Math.max(0, (session?.questions.length ?? 0) - answeredCount);
  const correctCount = answerValues.filter((answer) => answer.selectedOption !== null && answer.selectedOption !== undefined && answer.isCorrect === true).length;
  const pendingSaveCount = Object.keys(pendingSaves).length;
  const reviewableCount = session?.questions.filter((item) => {
    const answer = answers[item.id];
    return answer?.isCorrect === false;
  }).length ?? 0;

  function setQuestionPending(questionId: string, pending: boolean) {
    setPendingSaves((current) => {
      if (pending) return current[questionId] ? current : { ...current, [questionId]: true };
      if (!current[questionId]) return current;
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  }

  async function saveCurrent(selectedOption: number | null, markedForReview: boolean) {
    if (!session || !question || complete) return;
    const questionId = question.id;
    const previousAnswer = answers[questionId];
    const requestVersion = (saveVersions.current[questionId] ?? 0) + 1;
    saveVersions.current[questionId] = requestVersion;

    setMessage("");
    setQuestionPending(questionId, true);
    setAnswers((current) => ({
      ...current,
      [questionId]: {
        selectedOption,
        markedForReview,
        isCorrect: null,
      },
    }));

    try {
      const result = await savePracticeAnswer({
        sessionId: session.id,
        questionId,
        selectedOption,
        markedForReview,
      });

      if (saveVersions.current[questionId] !== requestVersion) return;
      if ("error" in result) {
        setMessage(result.error ?? "Could not save this answer. Please try again.");
        setAnswers((current) => {
          if (previousAnswer) return { ...current, [questionId]: previousAnswer };
          const next = { ...current };
          delete next[questionId];
          return next;
        });
        return;
      }
      if (result.expired) {
        setMessage("Time is up. Your saved answers are being submitted.");
        setAnswers((current) => {
          if (previousAnswer) return { ...current, [questionId]: previousAnswer };
          const next = { ...current };
          delete next[questionId];
          return next;
        });
        setFinishRequested(true);
        return;
      }

      setAnswers((current) => ({
        ...current,
        [questionId]: {
          selectedOption,
          markedForReview,
          isCorrect: null,
        },
      }));
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

  function toggleReview() {
    if (!question) return;
    const currentAnswer = answers[question.id];
    void saveCurrent(currentAnswer?.selectedOption ?? null, !currentAnswer?.markedForReview);
  }

  async function completeSession() {
    if (!session || pendingSaveCount > 0 || finishStarted.current) return;
    finishStarted.current = true;
    setIsFinishing(true);
    const result = await finishPracticeSession(session.id);
    setIsFinishing(false);
    if ("error" in result) {
      finishStarted.current = false;
      setMessage(result.error ?? "Could not finish practice. Please try again.");
      setShowSubmit(false);
      return;
    }
    setAnswers(result.session.answers);
    setFinishRequested(false);
    setComplete(true);
    setShowSubmit(false);
  }

  async function claimReviewReward() {
    if (!session || isClaimingReviewXp || reviewMessage) return;
    setIsClaimingReviewXp(true);
    const result = await claimAttemptReviewXp(session.id);
    setIsClaimingReviewXp(false);
    setReviewMessage("error" in result ? result.error ?? "Could not record this review." : result.xpEarned ? "Review complete: 5 XP earned." : "This review was already claimed or today’s repeatable XP limit was reached.");
  }

  useEffect(() => {
    finishHandler.current = completeSession;
  });

  useEffect(() => {
    if (!session || session.status !== "in_progress" || complete || session.timeLimitSeconds === null) return;
    const updateRemaining = () => {
      const deadline = Date.parse(session.startedAt) + session.timeLimitSeconds! * 1000;
      const nextRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);
      if (nextRemaining === 0) setFinishRequested(true);
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [session, complete]);

  useEffect(() => {
    if (finishRequested && pendingSaveCount === 0) void finishHandler.current();
  }, [finishRequested, pendingSaveCount]);

  if (!session) {
    return (
      <>
        <PageHeading eyebrow="Practice session" title="Unable to open session" description="The session could not be loaded from your account." />
        <Panel className="max-w-[700px] p-5"><p role="alert" className="m-0 text-[12px] text-[#b64b53]">{error || "Practice session not found."}</p></Panel>
      </>
    );
  }

  if (session.questions.length === 0) {
    return <><PageHeading eyebrow="Practice session" title="No questions in this session" /><Panel className="p-5"><p className="m-0 text-[12px] text-[#64788d]">The session has no approved questions. Return to practice setup after an administrator imports the question source.</p></Panel></>;
  }

  if (complete) {
    return (
      <>
        <PageHeading eyebrow="Session complete" title={session.sessionName} description={`${answeredCount} answered - ${correctCount} correct - ${session.questions.length} questions${session.completedAt ? ` · Completed ${new Date(session.completedAt).toLocaleString()}` : ""}`} />
        <div className="max-w-[850px]">
          <Panel className="mb-4 p-5">
            <p className="m-0 text-[12px] leading-6 text-[#60758a]">Correct answers and explanations are shown below.</p>
            <div className="mt-4 flex flex-wrap gap-2"><Link href={`/student/solutions/${session.id}`} className="primary-button">Open saved solutions</Link><Link href="/student/solutions" className="secondary-button">All solutions</Link><Link href="/student/practice" className="secondary-button">Start another session</Link>{reviewableCount > 0 && <button type="button" onClick={() => void claimReviewReward()} disabled={isClaimingReviewXp || Boolean(reviewMessage)} className="secondary-button disabled:opacity-60">{isClaimingReviewXp ? "Recording review..." : "Mark review complete · +5 XP"}</button>}</div>
            {reviewMessage && <p role="status" className="mb-0 mt-3 text-[11px] text-[#52766d]">{reviewMessage}</p>}
          </Panel>
          <div className="flex flex-col gap-2">
            {session.questions.map((item, index) => {
              const answer = answers[item.id];
              const correctOption = answer?.correctOption;
              const selectedOption = answer?.selectedOption;
              return (
                <details key={item.id} className="rounded-md border border-[#e1e8ef] bg-white px-4 py-3">
                  <summary className="cursor-pointer text-[11px] font-semibold text-[#30465d]">Question {index + 1} · {correctOption === undefined || correctOption === null ? "Answer unavailable" : selectedOption === correctOption ? "Correct" : `Correct answer: ${String.fromCharCode(65 + correctOption)}`}</summary>
                  <div className="pt-3">
                    <p className="text-[13px] font-semibold leading-6 text-[#253a51]">{item.prompt}</p>
                    <div className="flex flex-col gap-1.5">
                      {item.options.map((option, optionIndex) => {
                        const isCorrect = correctOption === optionIndex;
                        const isSelected = selectedOption === optionIndex;
                        return <p key={optionIndex} className={`m-0 rounded border px-3 py-2 text-[11px] ${isCorrect ? "border-[#a6d9c0] bg-[#edf8f2] text-[#197c62]" : isSelected ? "border-[#edb4b5] bg-[#fff2f2] text-[#a84c51]" : "border-[#edf1f5] text-[#64788d]"}`}><strong>{String.fromCharCode(65 + optionIndex)}.</strong> {option}{isSelected ? " · Your answer" : ""}{isCorrect ? " · Correct answer" : ""}</p>;
                      })}
                    </div>
                    {answer?.explanation && <p className="mb-0 mt-3 text-[11px] leading-5 text-[#60758a]">{answer.explanation}</p>}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  if (!question) {
    return <Panel className="p-5"><p role="alert" className="m-0 text-[12px] text-[#b64b53]">This session does not contain a question at the selected position.</p></Panel>;
  }

  const savedAnswer = answers[question.id];
  const currentSaving = Boolean(pendingSaves[question.id]);

  return (
    <div className="-mx-3 -mt-3 min-h-[calc(100vh-64px)] rounded-lg bg-[#eff4f8] p-3 sm:-mx-5 sm:-mt-5 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-[#102845] px-4 py-3 text-white">
        <div className="flex items-center gap-2"><BrandMark size={24} /><div><p className="m-0 text-[12px] font-bold">NursePrep <span className="font-normal text-[#a8bdd3]">/ Practice session</span></p><p className="mb-0 mt-1 text-[10px] text-[#a8bdd3]">{session.questionSet} - {session.questions.length} saved questions</p></div></div>
        <div className="flex items-center gap-3">
          <Tag tone={pendingSaveCount > 0 ? "orange" : "green"}>{pendingSaveCount > 0 ? "Saving answers..." : "Autosaves answers"}</Tag>
          {remainingSeconds !== null && <div aria-live="polite" className={`min-w-[84px] rounded border px-3 py-2 text-center font-mono text-[14px] font-bold tabular-nums ${remainingSeconds <= 300 ? "border-[#f3a4a4] bg-[#7f3037] text-white" : "border-[#7890aa] bg-[#1b3856] text-white"}`}>{formatDuration(remainingSeconds)}</div>}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_270px]">
        <Panel className="min-h-[470px] p-5 sm:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-[#e8edf2] pb-4">
            <div><p className="eyebrow mb-1">{question.courseName}</p><p className="m-0 text-[11px] text-[#8491a2]">Question {currentIndex + 1} of {session.questions.length}{currentSaving ? " - saving" : ""}</p></div>
            <button type="button" onClick={toggleReview} className={`rounded border px-3 py-2 text-[10px] font-semibold ${savedAnswer?.markedForReview ? "border-[#f0c873] bg-[#fff8e8] text-[#a97720]" : "border-[#e0e7ee] text-[#6e7f93]"}`}>{savedAnswer?.markedForReview ? "Marked for review" : "Mark for review"}</button>
          </div>
          <p className="max-w-3xl text-[16px] font-semibold leading-7 text-[#253a51]">{question.prompt}</p>
          <div className="mt-6 flex max-w-3xl flex-col gap-2.5">
            {question.options.map((option, index) => {
              const selected = savedAnswer?.selectedOption === index;
              const correct = savedAnswer?.correctOption === index;
              const wrong = selected && savedAnswer?.isCorrect === false;
              const choiceClass = correct
                ? "border-[#72c5a2] bg-[#eaf8f1] text-[#197c62]"
                : wrong
                  ? "border-[#e9a6a7] bg-[#fff0f0] text-[#b64b53]"
                  : selected
                    ? "border-[#5f5be5] bg-[#f4f3ff] text-[#423ba9]"
                    : "border-[#e3eaf0] bg-white text-[#465c72] hover:border-[#aab8c8]";
              return <button key={`${question.id}-${index}`} type="button" onClick={() => void saveCurrent(index, savedAnswer?.markedForReview ?? false)} className={`flex min-h-12 items-center gap-3 rounded-md border px-3 text-left text-[12px] ${choiceClass}`} aria-pressed={selected}><span className="grid size-6 shrink-0 place-items-center rounded-full border border-current text-[10px] font-bold">{String.fromCharCode(65 + index)}</span>{option}</button>;
            })}
          </div>
          {savedAnswer?.selectedOption !== null && savedAnswer?.selectedOption !== undefined && savedAnswer.correctOption !== undefined && (
            <div className={`mt-5 rounded-md p-3 text-[11px] leading-5 ${savedAnswer.isCorrect ? "bg-[#eaf8f1] text-[#197c62]" : "bg-[#fff5e9] text-[#936824]"}`}>
              <strong>{savedAnswer.isCorrect ? "Correct." : `Review: the correct option is ${String.fromCharCode(65 + (savedAnswer.correctOption ?? 0))}.`}</strong>
              {savedAnswer.explanation && <p className="mb-0 mt-1">{savedAnswer.explanation}</p>}
            </div>
          )}
          {message && <p role="alert" className="mt-4 rounded border border-[#f1cccc] bg-[#fff3f3] px-3 py-2 text-[11px] text-[#b64b53]">{message}</p>}
          <div className="mt-8 flex flex-wrap justify-between gap-2 border-t border-[#edf1f5] pt-4"><button type="button" onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))} disabled={currentIndex === 0} className="secondary-button disabled:opacity-40">Previous</button><button type="button" onClick={() => setCurrentIndex((value) => Math.min(session.questions.length - 1, value + 1))} disabled={currentIndex === session.questions.length - 1} className="primary-button disabled:opacity-50">Next question</button></div>
        </Panel>
        <Panel className="h-fit p-4">
          <div className="mb-4"><h2 className="section-title m-0">Question navigator</h2><p className="mb-0 mt-1 text-[10px] text-[#8291a3]">Choose any question</p></div>
          <div className="mb-4 grid max-h-[280px] grid-cols-5 gap-1.5 overflow-y-auto">
            {session.questions.map((item, index) => {
              const answer = answers[item.id];
              return <button type="button" key={item.id} aria-label={`Question ${index + 1}${answer?.selectedOption !== null && answer?.selectedOption !== undefined ? ", answered" : ", unanswered"}${answer?.markedForReview ? ", marked for review" : ""}`} onClick={() => setCurrentIndex(index)} className={`aspect-square rounded text-[9px] font-bold transition-colors duration-100 ${index === currentIndex ? "bg-[#5548e8] text-white" : answer?.markedForReview ? "bg-[#fff0cf] text-[#956616]" : answer?.selectedOption !== null && answer?.selectedOption !== undefined ? "bg-[#ddf4eb] text-[#19866a]" : "bg-[#f0f3f6] text-[#6c7d91]"}`}>{index + 1}</button>;
            })}
          </div>
          <div className="grid grid-cols-3 gap-1 border-t border-[#edf1f5] pt-3 text-center"><div><p className="m-0 text-[15px] font-bold text-[#27866b]">{answeredCount}</p><p className="mb-0 mt-1 text-[9px] text-[#8492a3]">Answered</p></div><div><p className="m-0 text-[15px] font-bold text-[#697c91]">{unansweredCount}</p><p className="mb-0 mt-1 text-[9px] text-[#8492a3]">Unanswered</p></div><div><p className="m-0 text-[15px] font-bold text-[#be8a2d]">{reviewCount}</p><p className="mb-0 mt-1 text-[9px] text-[#8492a3]">Review</p></div></div>
          <button type="button" onClick={() => setShowSubmit(true)} disabled={pendingSaveCount > 0} className="mt-4 min-h-10 w-full rounded-md bg-[#e65d62] text-[11px] font-bold text-white hover:bg-[#d54d53] disabled:cursor-not-allowed disabled:opacity-60">{pendingSaveCount > 0 ? "Saving answers..." : "Finish practice"}</button>
        </Panel>
      </div>
      {showSubmit && <div className="fixed inset-0 z-50 grid place-items-center bg-[#10243b]/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="finish-title" className="w-full max-w-[390px] rounded-lg bg-white p-6 shadow-xl"><h2 id="finish-title" className="mt-0 text-center text-[18px] font-bold text-[#20354d]">Finish this practice session?</h2><p className="mt-2 text-center text-[12px] leading-5 text-[#728399]">{unansweredCount > 0 ? `${unansweredCount} question${unansweredCount === 1 ? " is" : "s are"} unanswered. Your saved answers will be kept.` : "All questions are answered. Finish and save this session?"}</p><div className="mt-5 flex justify-center gap-2"><button type="button" onClick={() => setShowSubmit(false)} className="secondary-button">Keep practicing</button><button type="button" disabled={isFinishing || pendingSaveCount > 0} onClick={completeSession} className="primary-button disabled:cursor-not-allowed disabled:opacity-60">{isFinishing ? "Saving..." : pendingSaveCount > 0 ? "Saving answers..." : "Finish"}</button></div></section></div>}
    </div>
  );
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
