import Link from "next/link";
import type { StudentQuestionSolution, StudentSolutionReview, StudentSolutionSession } from "@/lib/actions/solutions";
import { PageHeading, Panel, Tag } from "@/components/ui";

export function StudentSolutionsPage({ sessions, error }: { sessions: StudentSolutionSession[]; error?: string }) {
  return <>
    <PageHeading eyebrow="Saved session history" title="Solutions" description="Every completed practice and mock exam is saved here with its answers, correct options, and explanations." action={<Link href="/student/practice" className="primary-button">Start practice →</Link>} />
    {error && <p role="alert" className="mb-3 rounded border border-[#f1cccc] bg-[#fff3f3] px-3 py-2 text-[11px] text-[#b64b53]">{error}</p>}
    {sessions.length ? <div className="flex max-w-[980px] flex-col gap-2">
      {sessions.map((session) => {
        const submittedAt = session.completedAt ?? session.startedAt;
        const score = session.answeredCount ? Math.round((session.correctCount / session.answeredCount) * 100) : null;
        return <Panel key={session.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-[13px] font-bold text-[#293f56]">{session.name}</h2>
              <Tag tone={session.questionSet === "mock_exam" ? "blue" : "green"}>{session.questionSet === "mock_exam" ? "Mock exam" : "Practice"}</Tag>
            </div>
            <p className="mb-0 mt-2 text-[10px] text-[#8190a1]">{session.answeredCount}/{session.questionCount} answered · {session.correctCount} correct{score === null ? "" : ` · ${score}%`}</p>
            <p className="mb-0 mt-1 text-[10px] text-[#8190a1]">Completed {formatDateTime(submittedAt)}</p>
          </div>
          <Link href={`/student/solutions/${session.id}`} className="secondary-button">View solutions →</Link>
        </Panel>;
      })}
    </div> : <Panel className="max-w-[760px] p-5">
      <p className="m-0 text-[12px] font-semibold text-[#40566d]">No completed sessions yet</p>
      <p className="mb-0 mt-2 text-[11px] leading-5 text-[#75869a]">Finish a practice session or mock exam, and its answers will be saved here for review.</p>
      <Link href="/student/practice" className="primary-button mt-4">Start practice</Link>
    </Panel>}
  </>;
}

export function StudentSolutionReviewPage({ review, error }: { review: StudentSolutionReview | null; error?: string }) {
  if (!review) return <>
    <PageHeading eyebrow="Saved solutions" title="Solutions unavailable" description="This session may not be completed or may not belong to your account." />
    {error && <p role="alert" className="rounded border border-[#f1cccc] bg-[#fff3f3] px-3 py-2 text-[11px] text-[#b64b53]">{error}</p>}
    <Link href="/student/solutions" className="secondary-button">← Back to solutions</Link>
  </>;

  return <>
    <PageHeading eyebrow={review.questionSet === "mock_exam" ? "Mock exam solutions" : "Practice solutions"} title={review.name} description={`${review.answeredCount} answered · ${review.correctCount} correct · Completed ${formatDateTime(review.completedAt ?? review.startedAt)}`} action={<Link href="/student/solutions" className="secondary-button">← All solutions</Link>} />
    {review.questions.length ? <div className="flex max-w-[1000px] flex-col gap-3">
      {review.questions.map((question) => <SolutionQuestion key={question.questionId} question={question} />)}
    </div> : <Panel className="max-w-[760px] p-5"><p className="m-0 text-[12px] font-semibold text-[#40566d]">No answers were saved</p><p className="mb-0 mt-2 text-[11px] text-[#75869a]">This completed session has no answered questions to review.</p></Panel>}
  </>;
}

function SolutionQuestion({ question }: { question: StudentQuestionSolution }) {
  const selectedText = question.options[question.selectedOption] ?? "Unknown option";
  const correctText = question.options[question.correctOption] ?? "Unavailable";

  return <Panel className="p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2"><Tag tone="blue">{question.courseName}</Tag><span className="text-[10px] text-[#8794a3]">Question {question.questionOrder}</span></div>
      <Tag tone={question.isCorrect ? "green" : "red"}>{question.isCorrect ? "Correct" : "Incorrect"}</Tag>
    </div>
    <p className="mb-0 mt-3 text-[13px] font-semibold leading-6 text-[#2d435a]">{question.prompt}</p>
    <div className="mt-3 flex flex-col gap-1.5">
      {question.options.map((option, index) => {
        const isCorrect = index === question.correctOption;
        const isSelected = index === question.selectedOption;
        const tone = isCorrect ? "border-[#a6d9c0] bg-[#edf8f2] text-[#197c62]" : isSelected ? "border-[#edb4b5] bg-[#fff2f2] text-[#a84c51]" : "border-[#edf1f5] bg-[#fafcfd] text-[#64788d]";
        return <div key={`${question.questionId}-${index}`} className={`flex items-start gap-2 rounded border px-3 py-2 text-[11px] ${tone}`}>
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[9px] font-bold">{String.fromCharCode(65 + index)}</span>
          <span className="flex-1 leading-5">{option}</span>
          <span className="shrink-0 text-[9px] font-bold uppercase">{isCorrect ? "Correct answer" : isSelected ? "Your answer" : ""}</span>
        </div>;
      })}
    </div>
    <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
      <div className={`rounded p-2.5 ${question.isCorrect ? "bg-[#edf8f2] text-[#197c62]" : "bg-[#fff2f2] text-[#a84c51]"}`}><p className="m-0 text-[9px] font-bold uppercase">Your answer</p><p className="mb-0 mt-1">{selectedText}</p></div>
      <div className="rounded bg-[#eaf8f1] p-2.5 text-[#218368]"><p className="m-0 text-[9px] font-bold uppercase">Correct answer</p><p className="mb-0 mt-1 font-semibold">{correctText}</p></div>
    </div>
    {question.explanation && <p className="mb-0 mt-3 text-[11px] leading-5 text-[#74859a]">{question.explanation}</p>}
    <p className="mb-0 mt-3 text-[9px] text-[#8b98a7]">{question.sourceTitle}{question.sourceYear ? ` · ${question.sourceYear}` : ""}{question.sourceQuestionNumber ? ` · Source question ${question.sourceQuestionNumber}` : ""}</p>
  </Panel>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}