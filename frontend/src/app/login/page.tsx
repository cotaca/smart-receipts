"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Mail01Icon,
  LockPasswordIcon,
  ViewIcon,
  ViewOffIcon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Invoice01Icon,
} from "@hugeicons/core-free-icons";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "@/hooks/use-theme";
import { ApiError, login, register, setAccessToken } from "@/lib/api";

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

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
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
    <div className="flex min-h-screen w-full items-center justify-center bg-muted p-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
            <HugeiconsIcon
              icon={Invoice01Icon}
              className="text-primary-foreground"
            />
          </div>
          <div className="text-sm font-semibold tracking-tight text-foreground">
            SmartReceipts
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <Tabs
              value={mode}
              onValueChange={(value) => switchMode(value as Mode)}
            >
              <TabsList className="w-full">
                <TabsTrigger value="login">Log in</TabsTrigger>
                <TabsTrigger value="register">Create account</TabsTrigger>
              </TabsList>
            </Tabs>

            {showSuccess ? (
              <div className="flex flex-col items-center gap-2.5 px-1 pt-5 pb-2">
                <div className="flex size-9 items-center justify-center rounded-full bg-foreground/8">
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    className="text-foreground"
                  />
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {isLogin ? "Signed in" : "Account created"}
                </div>
                <div className="text-center text-xs text-muted-foreground">
                  Redirecting you to your receipts…
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                {errorMessage && (
                  <Alert variant="destructive">
                    <HugeiconsIcon icon={AlertCircleIcon} />
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <InputGroup>
                    <InputGroupAddon>
                      <HugeiconsIcon icon={Mail01Icon} />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </InputGroup>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Password</Label>
                  <InputGroup>
                    <InputGroupAddon>
                      <HugeiconsIcon icon={LockPasswordIcon} />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label="Toggle password visibility"
                      >
                        <HugeiconsIcon
                          icon={showPassword ? ViewOffIcon : ViewIcon}
                        />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading && <Spinner />}
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
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto p-0 text-foreground"
                    onClick={() => switchMode(isLogin ? "register" : "login")}
                  >
                    {isLogin ? "Sign up" : "Log in"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button type="button" variant="ghost" size="sm" onClick={toggleTheme}>
            {dark ? "Switch to light" : "Switch to dark"}
          </Button>
        </div>
      </div>
    </div>
  );
}
