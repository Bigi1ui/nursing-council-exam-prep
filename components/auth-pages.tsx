"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
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

  const isLoginPage = mode === "login";
  const isRegisterPage = mode === "register";
  const isPasswordPage = mode === "forgot" || mode === "reset";

  return (
    <main className="min-h-screen bg-[#edf5fb] p-3 sm:p-5 lg:p-7">
      <div className={`mx-auto grid max-w-[1400px] gap-5 ${isPasswordPage ? "lg:grid-cols-[1.05fr_1fr]" : "lg:grid-cols-[1.3fr_1fr]"} ${isRegisterPage ? "lg:[&>*:last-child]:max-w-[490px]" : ""}`}>
        <PromoCard mode={mode} />

        {isLoginPage ? (
          <FormCard
            title="Welcome Back"
            subtitle="Log in to your NursePrep account"
            form={
              <>
                <Field label="Email Address" type="email" value={email} onChange={setEmail} error={fieldError.email} autoComplete="email" placeholder="Enter your email address" icon="✉" />
                <Field label="Password" type="password" value={password} onChange={setPassword} error={fieldError.password} autoComplete="current-password" placeholder="Enter your password" icon="🔒" />
                <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-[#60768c]">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-[#cfe0ed] accent-[#1ba98a]" />
                    <span>Remember me</span>
                  </label>
                  <Link href="/forgot-password" className="font-semibold text-[#4a6ce6] no-underline">Forgot password?</Link>
                </div>
                {message && <StatusMessage tone={messageTone}>{message}</StatusMessage>}
                <button type="submit" className="mt-3 w-full rounded-2xl bg-[#0d2c49] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#123d61] disabled:cursor-not-allowed disabled:opacity-70" disabled={isLoading} onClick={(event) => {}}>
                  {isLoading ? "Please wait..." : "Log in →"}
                </button>
              </>
            }
            footer={
              <p className="mt-4 text-center text-[12px] text-[#7d8fa3]">
                Don&apos;t have an account? <Link href="/register" className="font-semibold text-[#4e61c5] no-underline">Sign Up</Link>
              </p>
            }
            onSubmit={handleSubmit}
          />
        ) : isRegisterPage ? (
          <FormCard
            title="Create Your Account"
            subtitle="Join thousands of nursing students preparing for success."
            form={
              <>
                <Field label="Full Name" value={fullName} onChange={setFullName} error={fieldError.fullName} autoComplete="name" placeholder="Enter your full name" icon="👤" />
                <Field label="Email Address" type="email" value={email} onChange={setEmail} error={fieldError.email} autoComplete="email" placeholder="Enter your email address" icon="✉" />
                <Field label="Password" type="password" value={password} onChange={setPassword} error={fieldError.password} autoComplete="new-password" placeholder="Create a password" icon="🔒" />
                <Field label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} error={fieldError.confirmPassword} autoComplete="new-password" placeholder="Confirm your password" icon="🔒" />
                <Field label="Nursing School (Optional)" value="" onChange={() => {}} placeholder="Enter your nursing school" icon="🏫" optional />
                <Field label="Expected Date (Optional)" value="" onChange={() => {}} placeholder="Select a date" icon="📅" optional />
                {message && <StatusMessage tone={messageTone}>{message}</StatusMessage>}
                <button type="submit" className="mt-3 w-full rounded-2xl bg-[#12a58b] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0f8d72] disabled:cursor-not-allowed disabled:opacity-70" disabled={isLoading} onClick={(event) => {}}>
                  {isLoading ? "Please wait..." : "Sign Up →"}
                </button>
              </>
            }
            footer={
              <p className="mt-4 text-center text-[12px] text-[#7d8fa3]">
                Already have an account? <Link href="/login" className="font-semibold text-[#4e61c5] no-underline">Log in</Link>
              </p>
            }
            onSubmit={handleSubmit}
          />
        ) : (
          <FormCard
            title={mode === "forgot" ? "Forgot Your Password?" : "Reset Your Password"}
            subtitle={mode === "forgot" ? "No worries! Enter your email and we’ll send you a link to reset your password." : "Enter your new password below."}
            form={
              <>
                {mode === "forgot" ? (
                  <Field label="Email Address" type="email" value={email} onChange={setEmail} error={fieldError.email} autoComplete="email" placeholder="Enter your email address" icon="✉" />
                ) : (
                  <>
                    <Field label="New Password" type="password" value={password} onChange={setPassword} error={fieldError.password} autoComplete="new-password" placeholder="Create a new password" icon="🔒" />
                    <Field label="Confirm New Password" type="password" value={confirmPassword} onChange={setConfirmPassword} error={fieldError.confirmPassword} autoComplete="new-password" placeholder="Confirm your new password" icon="🔒" />
                    <ul className="!mt-1 space-y-1 text-[10px] text-[#5b7287]">
                      <li className="flex items-center gap-2"><span className="text-[#1ba98a]">✓</span> At least 8 characters</li>
                      <li className="flex items-center gap-2"><span className="text-[#1ba98a]">✓</span> Include a number</li>
                      <li className="flex items-center gap-2"><span className="text-[#1ba98a]">✓</span> Include a symbol (! @ # $ %)</li>
                    </ul>
                  </>
                )}
                {message && <StatusMessage tone={messageTone}>{message}</StatusMessage>}
                <button type="submit" className="mt-3 w-full rounded-2xl bg-[#12a58b] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0f8d72] disabled:cursor-not-allowed disabled:opacity-70" disabled={isLoading} onClick={(event) => {}}>
                  {isLoading ? "Please wait..." : mode === "forgot" ? "Send Reset Link →" : "Reset Password →"}
                </button>
              </>
            }
            footer={
              <p className="mt-4 text-center text-[12px] text-[#7d8fa3]">
                <Link href="/login" className="font-semibold text-[#4e61c5] no-underline">Back to login</Link>
              </p>
            }
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </main>
  );
}

function PromoCard({ mode }: { mode: AuthMode }) {
  const isPasswordPage = mode === "forgot" || mode === "reset";

  if (isPasswordPage) {
    return (
      <aside className="relative overflow-hidden rounded-[24px] border border-[#dfeaf3] bg-[#0d2c49] p-6 text-white shadow-[0_20px_60px_rgba(12,44,73,0.12)] sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <BrandMark size={24} className="rounded" />
          </div>
          <div className="text-[22px] font-black tracking-[-.04em]">NursePrep</div>
        </div>

        <div className="relative z-10 max-w-[420px] pt-8">
          <h1 className="m-0 max-w-[270px] text-[34px] font-black leading-[1.02] tracking-[-.05em] text-white">
            {mode === "forgot" ? "Forgot Your\nPassword?" : "Reset Your\nPassword"}
          </h1>
        </div>

        <div className="relative mt-10 flex min-h-[180px] items-end justify-center">
          <div className="absolute right-2 top-3 h-20 w-20 rounded-full bg-[#43d0b4]/25 blur-2xl" />
          <div className="flex h-36 w-36 items-center justify-center rounded-full border-4 border-[#eaf9f5] bg-[#dffaf4] text-[56px] shadow-[0_16px_30px_rgba(17,80,109,0.2)] text-[#0d2c49]">
            {mode === "forgot" ? "✉" : "🔒"}
          </div>
        </div>

        <div className="relative z-10 mt-6 flex items-center gap-2 text-[11px] text-white/75">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#12a58b] text-[10px] font-bold text-white">✓</span>
          Your account is safe with us.
        </div>
      </aside>
    );
  }

  return (
    <aside className="relative overflow-hidden rounded-[26px] bg-[#0d2c49] px-5 pb-4 pt-6 text-white shadow-[0_20px_60px_rgba(12,44,73,0.12)] sm:px-7 sm:pb-5 sm:pt-7">
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1d4b75] ring-1 ring-white/10">
            <BrandMark size={27} className="rounded" />
          </div>
          <div>
            <div className="text-[22px] font-black tracking-[-.04em]">NursePrep</div>
            <div className="text-[10px] font-medium text-white/70">Study smarter. Pass with confidence.</div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-8 max-w-[480px]">
        <h1 className="m-0 max-w-[330px] text-[44px] font-black leading-[0.96] tracking-[-.05em] text-white sm:text-[52px]">
          Your Nursing<br />Exam Success<br />Starts Here
        </h1>
      </div>

      <div className="relative z-10 mt-7 flex max-w-[300px] flex-col gap-3 text-[12px] text-white/90">
        {[
          ["📚", "Real past questions"],
          ["✅", "Smart practice"],
          ["📈", "Track your progress"],
        ].map(([icon, label]) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-white/6 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#12a58b]/18 text-[15px]">{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="relative z-10 mt-6 flex items-end justify-center">
        <div className="absolute inset-x-6 bottom-0 h-28 rounded-[30%] bg-[#1e9d91]/26 blur-2xl" />
        <div className="relative flex h-[220px] w-full max-w-[330px] items-end justify-center rounded-t-[120px] bg-gradient-to-b from-[#1d8db6]/30 via-[#2da4b2]/20 to-[#0c2b4a]/0">
          <div className="relative h-36 w-36 rounded-full bg-gradient-to-br from-[#e4f4ff] to-[#b8e7ff] shadow-[0_18px_50px_rgba(8,34,58,0.35)]" />
          <div className="absolute bottom-14 h-20 w-28 rounded-[50px] bg-[#2f8de0] shadow-[0_10px_20px_rgba(16,70,123,0.25)]" />
          <div className="absolute bottom-28 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full bg-[#f2d0af]" />
          <div className="absolute bottom-36 left-1/2 h-12 w-20 -translate-x-1/2 rounded-[18px] bg-[#f3f5f7]" />
        </div>
      </div>

      <div className="relative z-10 mt-5 pb-2 text-[11px] font-medium text-white/60">Trusted by nursing students nationwide</div>
    </aside>
  );
}

function FormCard({
  title,
  subtitle,
  form,
  footer,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  form: ReactNode;
  footer: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-[26px] border border-[#dfeaf3] bg-[#f6fbff] p-5 shadow-[0_24px_60px_rgba(15,45,72,0.08)] sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[#1c3351]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#dffaf4] ring-1 ring-[#bfeadf]">
            <BrandMark size={18} className="rounded" />
          </div>
          <span className="text-[18px] font-black tracking-[-.04em]">NursePrep</span>
        </div>
        {title !== "Welcome Back" && (
          <Link href="/login" className="text-[11px] font-semibold text-[#2e5aa1] no-underline">← Back to login</Link>
        )}
      </div>

      <div className="mb-5 text-center">
        <h2 className="m-0 text-[32px] font-black tracking-[-.05em] text-[#0e2d47]">{title}</h2>
        <p className="mx-auto mt-2 max-w-[330px] text-[12px] leading-5 text-[#6982a0]">{subtitle}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        {form}
      </form>
      {footer}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  placeholder,
  icon,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  icon?: string;
  optional?: boolean;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");

  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between text-[11px] font-semibold text-[#536a80]" htmlFor={id}>
        <span>{label}</span>
        {optional && <span className="text-[10px] font-medium text-[#8ca0b7]">Optional</span>}
      </label>
      <div className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 shadow-sm transition ${error ? "border-[#f1c4c6] bg-[#fff9f9]" : "border-[#dfeaf4]"}`}>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#edf4fb] text-[13px] text-[#2d5578]">{icon ?? "•"}</span>
        <input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full border-0 bg-transparent text-[12px] text-[#22354e] outline-none placeholder:text-[#9aaec1]"
        />
      </div>
      {error && <p className="m-0 text-[10px] font-medium text-[#bb4a53]">{error}</p>}
    </div>
  );
}

function StatusMessage({ tone, children }: { tone: MessageTone; children: string }) {
  const styles = {
    error: "border-[#f1d2d4] bg-[#fff2f3] text-[#b64b53]",
    success: "border-[#cfeee2] bg-[#edfdf7] text-[#17735f]",
    info: "border-[#dae5f7] bg-[#f4f8ff] text-[#536b96]",
  };

  return <p className={`m-0 rounded-xl border px-3 py-2 text-[11px] leading-5 ${styles[tone]}`}>{children}</p>;
}

