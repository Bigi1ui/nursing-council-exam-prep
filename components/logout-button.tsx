"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth/logout";

export function LogoutButton({
  children = "Logout",
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setError("");
    setIsLoggingOut(true);

    try {
      await logout();
      router.replace("/");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to log out. Please try again."
      );
      setIsLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleLogout}
      disabled={isLoggingOut}
      title={error || undefined}
    >
      {isLoggingOut ? "Logging out..." : children}
    </button>
  );
}
