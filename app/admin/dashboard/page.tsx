import { AdminEmptyState } from "@/components/admin-empty-state";

export default function Page() { return <AdminEmptyState title="Admin analytics not connected" description="Student, question and assessment totals will appear here when the reporting queries are built." actionHref="/admin/questions" actionLabel="Open question bank" />; }