import type { SerializeOptions } from "cookie";
import { parse, serialize } from "cookie";

export const rememberSessionCookieName = "nurseprep-remember-session";
const persistentSessionSeconds = 60 * 60 * 24 * 365;
const rememberPreferenceEvent = "nurseprep:remember-preference-change";

export function isRememberedSession(value: string | undefined) {
  return value !== "0";
}

export function getRememberPreference() {
  return isRememberedSession(parse(document.cookie)[rememberSessionCookieName]);
}

export function setRememberPreference(remember: boolean) {
  document.cookie = serialize(
    rememberSessionCookieName,
    remember ? "1" : "0",
    rememberPreferenceCookieOptions(remember, window.location.protocol === "https:")
  );
  window.dispatchEvent(new Event(rememberPreferenceEvent));
}

export function subscribeRememberPreference(callback: () => void) {
  window.addEventListener(rememberPreferenceEvent, callback);
  return () => window.removeEventListener(rememberPreferenceEvent, callback);
}

export function sessionCookieOptions(options: SerializeOptions, remember: boolean): SerializeOptions {
  if (options.maxAge === 0) return options;

  const nextOptions = { ...options };
  if (remember) {
    nextOptions.maxAge = persistentSessionSeconds;
  } else {
    delete nextOptions.maxAge;
    delete nextOptions.expires;
  }
  return nextOptions;
}

export function rememberPreferenceCookieOptions(remember: boolean, secure: boolean): SerializeOptions {
  return {
    path: "/",
    sameSite: "lax",
    ...(secure ? { secure: true } : {}),
    ...(remember ? { maxAge: persistentSessionSeconds } : {}),
  };
}