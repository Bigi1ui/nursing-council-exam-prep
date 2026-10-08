"use client";

import { useRef, useState } from "react";
import { importPastQuestionDocument } from "@/lib/actions/practice";

export function AdminDocumentUpload({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = Array.from(inputRef.current?.files ?? []);
    if (!files.length) {
      setIsError(true);
      setMessage("Choose one or more PDFs, DOCX, or text files before uploading.");
      return;
    }

    setBusy(true);
    setMessage("");
    setIsError(false);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }

      const result = await importPastQuestionDocument(formData);

      if ("error" in result) {
        setIsError(true);
        setMessage(result.error ?? "The document could not be processed.");
        return;
      }

      const fileLabel = files.length > 1 ? `${files.length} files` : (files[0]?.name ?? "document");
      setMessage(
        `${result.imported ?? 0} questions imported from ${fileLabel}. ${result.aiUsed ? "AI extraction was used for answer detection." : "Pattern extraction was used for answer detection."}`
      );
      setIsError(false);
      if (inputRef.current) inputRef.current.value = "";
      setFileNames([]);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "The document upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={compact
        ? "rounded-md border border-[#dfe8f0] bg-white p-4"
        : "rounded-xl border border-[#dfe8f0] bg-white p-5 shadow-[0_10px_30px_rgba(17,42,74,0.04)]"}
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="m-0 text-[12px] font-bold text-[#30465d]">Upload past questions from your computer</p>
          <p className="mb-0 mt-1 text-[10px] text-[#7c8da0]">
            Accepted: PDF, DOCX, DOC, TXT, RTF. The system reads the text and detects the correct option automatically.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex w-full cursor-pointer flex-col gap-2 rounded-md border border-dashed border-[#ccd9e7] bg-[#f9fbfd] px-3 py-3 text-[11px] text-[#5e7389]">
            <span className="font-semibold text-[#334b66]">Select files</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
              className="hidden"
              onChange={(event) => setFileNames(Array.from(event.target.files ?? []).map((file) => file.name))}
            />
            <span className="inline-flex min-h-9 items-center justify-center rounded border border-[#dfe7ef] bg-white px-2 py-2 text-center text-[10px] font-semibold text-[#455d7d]">
              {fileNames.length ? fileNames.join(", ") : "Choose PDF / DOCX / TXT files"}
            </span>
          </label>

          <button type="submit" disabled={busy} className="primary-button w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Processing documents..." : "Upload and parse questions"}
          </button>
        </form>

        {message && (
          <p
            role={isError ? "alert" : "status"}
            className={`mb-0 text-[10px] leading-5 ${isError ? "text-[#b64b53]" : "text-[#168468]"}`}
          >
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
