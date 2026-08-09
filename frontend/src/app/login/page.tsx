"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Mail01Icon,
  LockPasswordIcon,
  ViewIcon,
  ViewOffIcon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  Invoice01Icon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/hooks/use-theme";
import { ApiError, login, register, setAccessToken } from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { dark, toggleTheme } = useTheme();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const isLogin = mode === "login";

  function switchMode(next: Mode) {
    setMode(next);
    setErrorMessage("");
    setShowSuccess(false);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setErrorMessage("");

    try {
      const { access_token } = isLogin
        ? await login(email, password)
        : await register(email, password);
      setAccessToken(access_token);
      setShowSuccess(true);
      setTimeout(() => router.push("/"), 700);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setErrorMessage("Invalid email or password");
      } else if (err instanceof ApiError && err.status === 409) {
        setErrorMessage("Email already registered");
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-secondary p-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-[9px] bg-primary">
            <HugeiconsIcon
              icon={Invoice01Icon}
              size={16}
              className="text-primary-foreground"
            />
          </div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            SmartReceipts
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5 shadow-sm">
          <div className="flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={cn(
                "h-[26px] flex-1 rounded-[7px] text-xs font-medium transition-colors",
                isLogin
                  ? "bg-background text-foreground shadow-sm"
                  : "bg-transparent text-muted-foreground",
              )}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={cn(
                "h-[26px] flex-1 rounded-[7px] text-xs font-medium transition-colors",
                !isLogin
                  ? "bg-background text-foreground shadow-sm"
                  : "bg-transparent text-muted-foreground",
              )}
            >
              Create account
            </button>
          </div>

          {showSuccess ? (
            <div className="flex flex-col items-center gap-2.5 px-1 pt-5 pb-2">
              <div className="flex size-[34px] items-center justify-center rounded-full bg-foreground/8">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  size={18}
                  className="text-foreground"
                />
              </div>
              <div className="text-[13px] font-semibold text-foreground">
                {isLogin ? "Signed in" : "Account created"}
              </div>
              <div className="text-center text-xs leading-relaxed text-muted-foreground">
                Redirecting you to your receipts…
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {errorMessage && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-2.5 py-2">
                  <HugeiconsIcon
                    icon={AlertCircleIcon}
                    size={14}
                    className="mt-px shrink-0 text-destructive"
                  />
                  <span className="text-xs leading-relaxed text-destructive">
                    {errorMessage}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="email"
                  className="text-xs font-medium text-foreground"
                >
                  Email
                </Label>
                <div className="relative flex items-center">
                  <HugeiconsIcon
                    icon={Mail01Icon}
                    size={15}
                    className="pointer-events-none absolute left-2.5 text-muted-foreground"
                  />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-[34px] pl-8"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="password"
                  className="text-xs font-medium text-foreground"
                >
                  Password
                </Label>
                <div className="relative flex items-center">
                  <HugeiconsIcon
                    icon={LockPasswordIcon}
                    size={15}
                    className="pointer-events-none absolute left-2.5 text-muted-foreground"
                  />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-[34px] pr-8 pl-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label="Toggle password visibility"
                    className="absolute right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground"
                  >
                    <HugeiconsIcon
                      icon={showPassword ? ViewOffIcon : ViewIcon}
                      size={15}
                    />
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="mt-0.5 h-[34px] w-full gap-1.5 text-[13px]"
              >
                {isLoading && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={13}
                    className="animate-spin"
                  />
                )}
                {isLoading
                  ? isLogin
                    ? "Signing in…"
                    : "Creating account…"
                  : isLogin
                    ? "Log in"
                    : "Create account"}
              </Button>

              <div className="text-center text-xs text-muted-foreground">
                {isLogin
                  ? "Don't have an account?"
                  : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => switchMode(isLogin ? "register" : "login")}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  {isLogin ? "Sign up" : "Log in"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={toggleTheme}
            className="text-[11px] text-muted-foreground"
          >
            {dark ? "Switch to light" : "Switch to dark"}
          </button>
        </div>
      </div>
    </div>
  );
}
