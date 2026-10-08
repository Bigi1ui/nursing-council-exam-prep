import { AdminEmptyState } from "@/components/admin-empty-state";

export default function Page() { return <AdminEmptyState title="Question editor not connected" description="Questions can currently be imported and moderated in the question bank. Persistent manual question creation will be added next." actionHref="/admin/questions" actionLabel="Back to question bank" />; }