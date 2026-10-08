import Link from "next/link";
import { PageHeading, Panel } from "@/components/ui";

export function AdminEmptyState({ title, description, actionHref, actionLabel }: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <>
      <PageHeading eyebrow="Backend phase" title={title} description={description} />
      <Panel className="max-w-[760px] p-5">
        <p className="m-0 text-[12px] leading-6 text-[#718398]">No sample records are displayed. This workspace will populate from Supabase when its dedicated backend is connected.</p>
        {actionHref && actionLabel && <Link className="primary-button mt-4" href={actionHref}>{actionLabel} →</Link>}
      </Panel>
    </>
  );
}