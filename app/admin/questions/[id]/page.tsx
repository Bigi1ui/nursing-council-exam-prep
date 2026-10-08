import { AdminEmptyState } from "@/components/admin-empty-state";

export default function Page() { return <AdminEmptyState title="Question editor not connected" description="Use Question Management to search and moderate imported questions. Persistent editing will be added next." actionHref="/admin/questions" actionLabel="Back to question bank" />; }