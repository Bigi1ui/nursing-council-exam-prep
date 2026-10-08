import { Suspense } from "react";
import { MockExamSession } from "@/components/mock-exam-session";
import { getMockExamSession } from "@/lib/actions/mock-exam";

export const instant = false;

export default function Page({ params }: PageProps<"/student/mock-exam/[examId]">) {
  return (
    <Suspense fallback={<div className="grid min-h-[60vh] place-items-center text-[12px] text-[#708197]">Loading saved mock exam...</div>}>
      <MockExamPage params={params} />
    </Suspense>
  );
}

async function MockExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const response = await getMockExamSession(examId);
  return <MockExamSession session={"session" in response ? response.session ?? null : null} error={"error" in response ? response.error : undefined} />;
}