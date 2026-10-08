"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Panel } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "register" | "forgot" | "reset";
type Role = "student" | "admin";
type MessageTone = "error" | "success" | "info";
type SupabaseLookupError = {
  code?: string;
  message?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const minPasswordLength = 8;

function authCopy(mode: AuthMode) {
  return {
    login: ["Welcome back", "Log in to continue your exam preparation."],
    register: ["Create your account", "Set up your student study space."],
    forgot: ["Reset your password", "Enter your email and we will send reset instructions."],
    reset: ["Choose a new password", "Create a new password for your account."],
  }[mode];
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "A network error occurred. Please check your connection and try again.";
}

function isDuplicateEmail(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("already") || normalized.includes("registered");
}

function normalizeLoginError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid login") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("email not confirmed")
  ) {
    return message;
  }

  return message || "Invalid email or password.";
}

function profileSetupErrorMessage(error: SupabaseLookupError, action = "Login") {
  const message = error.message ?? "Unknown Supabase profile error.";
  const normalized = message.toLowerCase();

  if (
    error.code === "42P01" ||
    (normalized.includes("profiles") && normalized.includes("does not exist")) ||
    normalized.includes("could not find the table")
  ) {
    return `${action} worked, but Supabase cannot find the profiles table. Run supabase/migrations/20261007143000_create_profiles.sql in your Supabase SQL Editor, then try again.`;
  }

  if (
    error.code === "PGRST116" ||
    normalized.includes("0 rows") ||
    normalized.includes("json object requested")
  ) {
    return `${action} worked, but this user has no profile row yet. Run the profiles migration so the auth trigger/backfill creates student profiles, then try again.`;
  }

  if (error.code === "42501" || normalized.includes("permission denied")) {
    return `${action} worked, but Supabase blocked reading the profile. Check the profiles RLS policies and grants in the migration.`;
  }

  return `${action} worked, but the profile could not be loaded: ${message}`;
}

async function loadProfileRole(userId: string, action?: string): Promise<Role> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(profileSetupErrorMessage(error, action));
  }

  if (data?.role !== "student" && data?.role !== "admin") {
    throw new Error("Login succeeded, but the profile does not have a valid role.");
  }

  return data.role;
}

function destinationForRole(role: Role) {
  return role === "admin" ? "/admin/dashboard" : "/student/dashboard";
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [heading, description] = authCopy(mode);

  function showMessage(nextMessage: string, tone: MessageTone) {
    setMessage(nextMessage);
    setMessageTone(tone);
  }

  function validateEmail() {
    if (!email.trim()) {
      return "Email is required.";
    }

    if (!emailPattern.test(email.trim())) {
      return "Enter a valid email address.";
    }

    return "";
  }

  function validatePassword(requiredMessage = "Password is required.") {
    if (!password) {
      return requiredMessage;
    }

    return "";
  }

  function validateRegisterForm() {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) {
      errors.fullName = "Full name is required.";
    }

    const emailError = validateEmail();
    if (emailError) {
      errors.email = emailError;
    }

    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < minPasswordLength) {
      errors.password = `Password must be at least ${minPasswordLength} characters.`;
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Confirm your password.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    return errors;
  }

  async function handleLogin() {
    const errors: Record<string, string> = {};
    const emailError = validateEmail();
    const passwordError = validatePassword();

    if (emailError) {
      errors.email = emailError;
    }

    if (passwordError) {
      errors.password = passwordError;
    }

    setFieldError(errors);
    if (Object.keys(errors).length > 0) {
      showMessage("Please correct the highlighted fields.", "error");
      return;
    }

    setIsLoading(true);
    showMessage("Signing you in...", "info");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        showMessage(normalizeLoginError(error.message), "error");
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        showMessage("Login succeeded, but the authenticated user was not returned.", "error");
        return;
      }

      const role = await loadProfileRole(userId, "Login");
      showMessage("Login successful. Opening your workspace...", "success");
      router.replace(destinationForRole(role));
    } catch (error) {
      showMessage(getErrorMessage(error), "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister() {
    const errors = validateRegisterForm();
    setFieldError(errors);

    if (Object.keys(errors).length > 0) {
      showMessage("Please correct the highlighted fields.", "error");
      return;
    }

    setIsLoading(true);
    showMessage("Creating your student account...", "info");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        showMessage(
          isDuplicateEmail(error.message)
            ? "An account already exists for this email address."
            : error.message,
          "error"
        );
        return;
      }

      if (data.user?.identities && data.user.identities.length === 0) {
        showMessage("An account already exists for this email address.", "error");
        return;
      }

      if (!data.session) {
        showMessage(
          "Account created in Supabase Auth. Check your email to confirm your account before logging in.",
          "success"
        );
        return;
      }

      if (!data.user?.id) {
        showMessage("Account created, but the authenticated user was not returned.", "error");
        return;
      }

      const role = await loadProfileRole(data.user.id, "Registration");
      if (role !== "student") {
        showMessage("Registration completed, but the account was not assigned the student role.", "error");
        return;
      }

      showMessage("Account created. Opening your student dashboard...", "success");
      router.replace("/student/dashboard");
    } catch (error) {
      showMessage(getErrorMessage(error), "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleForgotPassword() {
    const emailError = validateEmail();
    setFieldError(emailError ? { email: emailError } : {});

    if (emailError) {
      showMessage(emailError, "error");
      return;
    }

    setIsLoading(true);
    showMessage("Sending password reset email...", "info");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        showMessage(error.message, "error");
        return;
      }

      showMessage("Password reset instructions have been sent to your email.", "success");
    } catch (error) {
      showMessage(getErrorMessage(error), "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword() {
    const errors: Record<string, string> = {};

    if (!password) {
      errors.password = "New password is required.";
    } else if (password.length < minPasswordLength) {
      errors.password = `Password must be at least ${minPasswordLength} characters.`;
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Confirm your new password.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    setFieldError(errors);
    if (Object.keys(errors).length > 0) {
      showMessage("Please correct the highlighted fields.", "error");
      return;
    }

    setIsLoading(true);
    showMessage("Updating your password...", "info");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        showMessage(error.message, "error");
        return;
      }

      showMessage("Password updated. You can now log in with your new password.", "success");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      showMessage(getErrorMessage(error), "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "login") {
      await handleLogin();
      return;
    }

    if (mode === "register") {
      await handleRegister();
      return;
    }

    if (mode === "forgot") {
      await handleForgotPassword();
      return;
    }

    await handleResetPassword();
  }

  return (
    <main className="grid min-h-screen bg-[#f3f7fb] lg:grid-cols-[minmax(0,1fr)_minmax(390px,.8fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#112b47] p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2 text-[14px] font-bold text-white no-underline">
          <span className="grid size-8 place-items-center rounded bg-white/10 text-[11px]">NP</span>
          NursePrep
        </Link>
        <div className="relative z-[1] max-w-[480px] pb-16">
          <p className="eyebrow !text-[#9fe0cd]">Nursing Council exam practice</p>
          <h1 className="mt-3 text-[36px] font-bold leading-tight">A calmer way to prepare for your next milestone.</h1>
          <p className="mt-4 max-w-[380px] text-[12px] leading-6 text-white/70">
            Real authentication, private study records, focused practice, and clear corrections for serious preparation.
          </p>
        </div>
        <p className="m-0 text-[10px] text-white/45">NursePrep - nursing exam practice</p>
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(150deg, transparent 56%, rgb(49 100 144 / 36%))" }} />
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <Panel className="w-full max-w-[430px] p-6 sm:p-8">
          <Link href="/" className="flex items-center justify-center gap-2 text-[14px] font-bold text-[#263f58] no-underline lg:hidden">
            <span className="grid size-7 place-items-center rounded bg-[#e8f6f2] text-[10px] text-[#16866c]">NP</span>
            NursePrep
          </Link>
          <div className="mb-6 mt-5 text-center">
            <p className="eyebrow mb-2">Secure account access</p>
            <h2 className="m-0 text-[21px] font-bold text-[#20364e]">{heading}</h2>
            <p className="mb-0 mt-2 text-[11px] text-[#7c8da0]">{description}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
            {mode === "register" && (
              <Field label="Full name" value={fullName} onChange={setFullName} error={fieldError.fullName} autoComplete="name" />
            )}

            {(mode === "login" || mode === "register" || mode === "forgot") && (
              <Field label="Email" type="email" value={email} onChange={setEmail} error={fieldError.email} autoComplete="email" />
            )}

            {(mode === "login" || mode === "register" || mode === "reset") && (
              <Field
                label={mode === "reset" ? "New password" : "Password"}
                type="password"
                value={password}
                onChange={setPassword}
                error={fieldError.password}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            )}

            {(mode === "register" || mode === "reset") && (
              <Field
                label={mode === "reset" ? "Confirm new password" : "Confirm password"}
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                error={fieldError.confirmPassword}
                autoComplete="new-password"
              />
            )}

            {mode === "login" && (
              <Link href="/forgot-password" className="self-end text-[10px] font-semibold text-[#5166ce] no-underline">
                Forgot Password
              </Link>
            )}

            {message && (
              <p
                className={`m-0 rounded border px-3 py-2 text-[11px] leading-5 ${
                  messageTone === "error"
                    ? "border-[#f1cccc] bg-[#fff3f3] text-[#b64b53]"
                    : messageTone === "success"
                      ? "border-[#cdebdc] bg-[#f0fbf6] text-[#18735e]"
                      : "border-[#d8e3f5] bg-[#f5f8ff] text-[#4c6599]"
                }`}
                role={messageTone === "error" ? "alert" : "status"}
              >
                {message}
              </p>
            )}

            <button type="submit" className="primary-button mt-2 w-full" disabled={isLoading}>
              {isLoading
                ? "Please wait..."
                : mode === "login"
                  ? "Login"
                  : mode === "register"
                    ? "Create Account"
                    : mode === "forgot"
                      ? "Send Reset Link"
                      : "Reset Password"}
            </button>
          </form>

          <p className="mb-0 mt-5 text-center text-[10px] text-[#8190a2]">
            {mode === "login" ? (
              <>
                New to NursePrep? <Link href="/register" className="font-semibold text-[#4e61c5]">Create Account</Link>
              </>
            ) : mode === "register" ? (
              <>
                Already have an account? <Link href="/login" className="font-semibold text-[#4e61c5]">Login</Link>
              </>
            ) : (
              <Link href="/login" className="font-semibold text-[#4e61c5]">Back to Login</Link>
            )}
          </p>
        </Panel>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");

  return (
    <label className="text-[10px] font-semibold text-[#536a80]" htmlFor={id}>
      {label}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        className={`mt-1.5 h-10 w-full rounded border px-3 text-[11px] text-[#344a61] outline-none placeholder:text-[#a1adba] focus:border-[#7268e4] ${
          error ? "border-[#e6a1a7]" : "border-[#dfe7ef]"
        }`}
      />
      {error && <span className="mt-1 block text-[10px] text-[#b64b53]">{error}</span>}
    </label>
  );
}
