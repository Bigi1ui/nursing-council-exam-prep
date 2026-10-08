import { Suspense } from "react";
import { PracticeSession } from "@/components/practice-session";
import { getPracticeSession } from "@/lib/actions/practice";

export const instant = false;

export default function Page({ params }: PageProps<"/student/practice/[sessionId]">) {
  return (
    <Suspense fallback={<PracticeFallback />}>
      <PracticeSessionPage params={params} />
    </Suspense>
  );
}

async function PracticeSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const result = await getPracticeSession(sessionId);
  return <PracticeSession session={"session" in result ? result.session ?? null : null} error={"error" in result ? result.error : undefined} />;
}

function PracticeFallback() {
  return <div className="grid min-h-[60vh] place-items-center text-[12px] text-[#708197]">Loading saved practice session...</div>;
}