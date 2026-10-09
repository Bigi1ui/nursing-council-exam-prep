import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isRememberedSession, rememberSessionCookieName, sessionCookieOptions } from "@/lib/supabase/session-cookie";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          const remember = isRememberedSession(cookieStore.get(rememberSessionCookieName)?.value);
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, sessionCookieOptions(options, remember));
            });
          } catch {
            // Server Components cannot always write cookies. The proxy refreshes
            // auth cookies before protected route rendering.
          }
        },
      },
    }
  );
}
