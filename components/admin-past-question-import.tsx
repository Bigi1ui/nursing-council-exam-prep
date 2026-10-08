"use client";

import { useState } from "react";
import { AdminDocumentUpload } from "@/components/admin-document-upload";
import { importProvidedPastQuestions } from "@/lib/actions/practice";

export function AdminPastQuestionImport() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleImport() {
    setBusy(true);
    setMessage("");
    const result = await importProvidedPastQuestions();
    setBusy(false);
    if ("error" in result) {
      setIsError(true);
      setMessage(result.error ?? "Question import failed.");
      return;
    }
    setIsError(false);
    setMessage(`${result.imported ?? 0} sourced questions imported. Questions with no answer key were skipped.`);
  }

  return (
    <>
      <section className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-md border border-[#dfe8f0] bg-white p-4">
        <div>
          <p className="m-0 text-[12px] font-bold text-[#30465d]">Provided past-question source</p>
          <p className="mb-0 mt-1 text-[10px] text-[#7c8da0]">Principles of Management and Teaching · duplicate-safe import</p>
          {message && <p role={isError ? "alert" : "status"} className={`mb-0 mt-2 text-[10px] ${isError ? "text-[#b64b53]" : "text-[#168468]"}`}>{message}</p>}
        </div>
        <button type="button" onClick={handleImport} disabled={busy} className="secondary-button disabled:opacity-50">
          {busy ? "Importing..." : "Import approved questions"}
        </button>
      </section>
      <div className="mb-4"><AdminDocumentUpload compact /></div>
    </>
  );
}