import { requireAuthContext } from "@/lib/auth/session";
import { ProfilePage } from "@/components/student-data-pages";

export default async function Page() {
  const auth = await requireAuthContext(["student"]);
  return <ProfilePage profile={auth.profile} />;
}