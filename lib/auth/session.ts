import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "student" | "admin";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthContext = {
  isLoggedIn: true;
  userId: string;
  user: User;
  role: UserRole;
  profile: Profile;
};

const profileColumns =
  "id, full_name, email, role, avatar_url, created_at, updated_at";

function isUserRole(role: unknown): role is UserRole {
  return role === "student" || role === "admin";
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(profileColumns)
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Unable to load authenticated profile: ${profileError.message}`);
  }

  if (!profile || !isUserRole(profile.role)) {
    throw new Error("Authenticated profile is missing a valid role.");
  }

  return {
    isLoggedIn: true,
    userId: user.id,
    user,
    role: profile.role,
    profile: profile as Profile,
  };
}

export async function requireAuthContext(
  allowedRoles?: UserRole[]
): Promise<AuthContext> {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(auth.role)) {
    redirect(auth.role === "student" ? "/student/dashboard" : "/admin/dashboard");
  }

  return auth;
}
