import { createBrowserClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import {
  getRememberPreference,
  isRememberedSession,
  rememberSessionCookieName,
  setRememberPreference,
  sessionCookieOptions,
} from "@/lib/supabase/session-cookie";

let cachedRememberMe: boolean | undefined;
let cachedClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient(rememberMe?: boolean) {
  const shouldRemember = rememberMe ?? getRememberPreference();

  if (rememberMe !== undefined) setRememberPreference(rememberMe);

  if (cachedClient && cachedRememberMe === shouldRemember) return cachedClient;

  cachedClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(parse(document.cookie)).flatMap(([name, value]) =>
            value === undefined ? [] : [{ name, value }]
          );
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            document.cookie = serialize(name, value, sessionCookieOptions(options, isRememberedSession(parse(document.cookie)[rememberSessionCookieName])));
          }
        },
      },
      isSingleton: false,
    }
  );
  cachedRememberMe = shouldRemember;
  return cachedClient;
}