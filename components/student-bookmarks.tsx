"use client";

import Link from "next/link";
import { useState } from "react";
import type { StudentBookmark } from "@/lib/actions/practice";
import { setQuestionBookmarked } from "@/lib/actions/practice";
import { PageHeading, Panel, Tag } from "@/components/ui";

export function StudentBookmarks({ initialBookmarks, error }: { initialBookmarks: StudentBookmark[]; error?: string }) {
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState(error ?? "");

  async function removeBookmark(questionId: string) {
    setBusyId(questionId);
    setMessage("");
    const result = await setQuestionBookmarked(questionId, false);
    setBusyId(null);
    if ("error" in result) {
      setMessage(result.error ?? "Could not remove bookmark.");
      return;
    }
    setBookmarks((current) => current.filter((bookmark) => bookmark.questionId !== questionId));
  }

  return <>
    <PageHeading eyebrow="Saved questions" title="Bookmarks" description="These questions are saved to your student account." action={<Link href="/student/practice?focus=bookmarks" className="primary-button">Practice bookmarks →</Link>} />
    {message && <p role="alert" className="mb-3 rounded border border-[#f1cccc] bg-[#fff3f3] px-3 py-2 text-[11px] text-[#b64b53]">{message}</p>}
    {bookmarks.length ? <div className="flex flex-col gap-3">{bookmarks.map((bookmark) => <Panel key={bookmark.questionId} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="min-w-[220px] flex-1"><div className="mb-2 flex flex-wrap gap-2"><Tag tone="blue">{bookmark.courseName}</Tag><Tag tone="gray">{bookmark.sourceTitle}{bookmark.sourceYear ? ` · ${bookmark.sourceYear}` : ""}</Tag></div><h2 className="m-0 text-[12px] font-semibold leading-5 text-[#2e4359]">{bookmark.prompt}</h2></div><button type="button" onClick={() => removeBookmark(bookmark.questionId)} disabled={busyId === bookmark.questionId} className="secondary-button disabled:opacity-50">{busyId === bookmark.questionId ? "Removing..." : "Remove bookmark"}</button></Panel>)}</div> : <Panel className="p-5"><p className="m-0 text-[11px] font-semibold text-[#536980]">No bookmarks saved yet</p><p className="mb-0 mt-1 text-[10px] leading-5 text-[#8291a3]">Bookmark questions during practice and they will appear here.</p></Panel>}
  </>;
}