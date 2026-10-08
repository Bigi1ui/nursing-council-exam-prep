"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteQuestion, getAdminQuestionBank, setQuestionReviewStatus, type AdminQuestion } from "@/lib/actions/practice";
import { PageHeading, Panel, Tag } from "@/components/ui";

export function AdminQuestionBank() {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAdminQuestionBank().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in result) {
        setError(result.error ?? "Could not load the question bank.");
        return;
      }
      setQuestions(result.questions ?? []);
    });
    return () => { cancelled = true; };
  }, []);

  const courses = [...new Set(questions.map((question) => question.courseName))].sort();
  const years = [...new Set(questions.map((question) => question.sourceYear).filter((year): year is number => year !== null))].sort((a, b) => b - a);
  const filtered = questions.filter((question) =>
    question.prompt.toLowerCase().includes(search.toLowerCase())
    && (courseFilter === "all" || question.courseName === courseFilter)
    && (yearFilter === "all" || String(question.sourceYear ?? "unknown") === yearFilter)
    && (statusFilter === "all" || question.reviewStatus === statusFilter)
    && (typeFilter === "all" || question.questionType === typeFilter)
  );

  async function moderate(questionId: string, status: "approved" | "rejected") {
    setBusyId(questionId);
    const result = await setQuestionReviewStatus(questionId, status);
    setBusyId(null);
    if ("error" in result) {
      setError(result.error ?? "Could not update question status.");
      return;
    }
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, reviewStatus: status } : question));
  }

  async function remove(questionId: string) {
    if (!window.confirm("Delete this question from the bank?")) return;
    setBusyId(questionId);
    const result = await deleteQuestion(questionId);
    setBusyId(null);
    if ("error" in result) {
      setError(result.error ?? "Could not delete question.");
      return;
    }
    setQuestions((current) => current.filter((question) => question.id !== questionId));
  }

  return (
    <>
      <PageHeading eyebrow="Content library" title="Question management" description="Search and moderate questions stored in the protected Supabase bank." action={<Link href="/admin/questions/new" className="primary-button">＋ Add question</Link>} />
      {error && <p role="alert" className="mb-3 rounded border border-[#f1cccc] bg-[#fff3f3] px-3 py-2 text-[11px] text-[#b64b53]">{error}</p>}
      <Panel className="p-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search question text" aria-label="Search questions" className="h-10 rounded border border-[#e0e7ef] px-3 text-[11px] outline-none focus:border-[#8179e8]" />
          <select aria-label="Filter by course" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className="h-10 rounded border border-[#e0e7ef] px-2 text-[11px] text-[#53677d]"><option value="all">All courses</option>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select>
          <select aria-label="Filter by year" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="h-10 rounded border border-[#e0e7ef] px-2 text-[11px] text-[#53677d]"><option value="all">All years</option><option value="unknown">Year not listed</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select>
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded border border-[#e0e7ef] px-2 text-[11px] text-[#53677d]"><option value="all">All statuses</option><option value="draft">draft</option><option value="pending_review">pending review</option><option value="approved">approved</option><option value="rejected">rejected</option></select>
          <select aria-label="Filter by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded border border-[#e0e7ef] px-2 text-[11px] text-[#53677d]"><option value="all">All types</option><option value="official_past">Official past question</option><option value="ai_practice">AI practice</option></select>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead><tr className="border-y border-[#e9eef3] text-[9px] uppercase tracking-wider text-[#8492a3]">{["Question", "Course", "Year", "Source", "Status", "Actions"].map((label) => <th key={label} className="px-3 py-3 font-bold">{label}</th>)}</tr></thead>
            <tbody>{filtered.map((question) => <tr key={question.id} className="border-b border-[#edf1f5] align-top">
              <td className="max-w-[320px] px-3 py-3 text-[10px] leading-5 text-[#3c5269]">{question.prompt}</td>
              <td className="px-3 py-3 text-[10px] text-[#64788d]">{question.courseName}</td>
              <td className="px-3 py-3 text-[10px] text-[#64788d]">{question.sourceYear ?? "Not listed"}</td>
              <td className="px-3 py-3 text-[10px] text-[#64788d]">{question.sourceTitle} · #{question.sourceQuestionNumber}</td>
              <td className="px-3 py-3"><Tag tone={question.reviewStatus === "approved" ? "green" : question.reviewStatus === "rejected" ? "red" : "orange"}>{question.reviewStatus}</Tag><span className="mt-1 block text-[9px] text-[#8593a4]">{question.questionType === "official_past" ? "Official past question" : "AI practice question"}</span></td>
              <td className="px-3 py-3"><div className="flex flex-wrap gap-2">{question.reviewStatus !== "approved" && <button type="button" disabled={busyId === question.id} onClick={() => moderate(question.id, "approved")} className="text-[10px] font-semibold text-[#18856a]">Approve</button>}{question.reviewStatus !== "rejected" && <button type="button" disabled={busyId === question.id} onClick={() => moderate(question.id, "rejected")} className="text-[10px] font-semibold text-[#a66d32]">Reject</button>}<button type="button" disabled={busyId === question.id} onClick={() => remove(question.id)} className="text-[10px] font-semibold text-[#c35e64]">Delete</button></div></td>
            </tr>)}</tbody>
          </table>
          {loading && <p className="py-8 text-center text-[11px] text-[#8392a5]">Loading saved questions...</p>}
          {!loading && !error && filtered.length === 0 && <p className="py-8 text-center text-[11px] text-[#8392a5]">No saved questions match these filters. Import the supplied source above to populate the bank.</p>}
        </div>
      </Panel>
    </>
  );
}