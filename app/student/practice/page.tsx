import { PracticeBuilder } from "@/components/practice-builder";
import { getPracticeSetupData } from "@/lib/actions/practice";

export const instant = false;

export default async function Page() {
  const setup = await getPracticeSetupData();
  return (
    <PracticeBuilder
      courses={"courses" in setup ? setup.courses ?? [] : []}
      availableCount={"questionCount" in setup ? setup.questionCount ?? 0 : 0}
      setupError={"error" in setup ? setup.error : undefined}
    />
  );
}