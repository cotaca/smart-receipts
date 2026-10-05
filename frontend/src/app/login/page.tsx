"use client";

import { Suspense, useState, type ReactNode, type SubmitEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Mail01Icon,
  LockPasswordIcon,
  ViewIcon,
  ViewOffIcon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { LogoMark } from "@/components/logo-mark";
import { PasswordRules } from "@/components/password-rules";
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
import {
  ApiError,
  hasErrorLoc,
  login,
  register,
  setAccessToken,
} from "@/lib/api";
import { isValidEmail, isValidPassword } from "@/lib/password";

type Mode = "login" | "register";

// useSearchParams needs a Suspense boundary or `next build` fails to prerender.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations("LoginPage");
  const router = useRouter();
  const { dark, toggleTheme } = useTheme();
  const initialMode: Mode =
    useSearchParams().get("tab") === "register" ? "register" : "login";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  // Register-mode validation: a field shows its error once it was left or
  // after a submit attempt; `emailTaken` is the server's 409.
  const [emailTouched, setEmailTouched] = useState(false);
  const [repeatTouched, setRepeatTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  const [serverEmailInvalid, setServerEmailInvalid] = useState(false);

  const isLogin = mode === "login";

  const emailValid = isValidEmail(email);
  const emailInvalid =
    !isLogin &&
    (((emailTouched || submitted) && !emailValid) || serverEmailInvalid);
  const passwordInvalid = !isLogin && submitted && !isValidPassword(password);
  const mismatch =
    !isLogin && (repeatTouched || submitted) && repeat !== password;
  const emailOk = !isLogin && emailTouched && emailValid && !emailTaken;

  function switchMode(next: Mode) {
    setMode(next);
    setErrorMessage("");
    setShowSuccess(false);
    setRepeat("");
    setEmailTouched(false);
    setRepeatTouched(false);
    setSubmitted(false);
    setEmailTaken(false);
    setServerEmailInvalid(false);
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isLoading) return;
    if (!isLogin) {
      setSubmitted(true);
      const firstInvalid = !emailValid
        ? "email"
        : !isValidPassword(password)
          ? "password"
          : repeat !== password
            ? "repeat"
            : null;
      if (firstInvalid) {
        document.getElementById(firstInvalid)?.focus();
        return;
      }
    }
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
        setErrorMessage(t("errorInvalidCredentials"));
      } else if (!isLogin && err instanceof ApiError && err.status === 409) {
        setEmailTaken(true);
        document.getElementById("email")?.focus();
      } else if (!isLogin && err instanceof ApiError && err.status === 422) {
        // The server is stricter than the client: EmailStr rejects e.g.
        // reserved domains, and Unicode classes can drift. It wins.
        if (hasErrorLoc(err, "email")) {
          setServerEmailInvalid(true);
          document.getElementById("email")?.focus();
        } else if (hasErrorLoc(err, "password")) {
          setErrorMessage(t("errorPasswordRules"));
        } else {
          setErrorMessage(t("errorGeneric"));
        }
      } else {
        setErrorMessage(t("errorGeneric"));
      }
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-muted p-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-col items-center gap-2">
          <LogoMark className="size-9" />
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
              <TabsList className="w-full max-sm:h-11">
                <TabsTrigger value="login">{t("tabLogin")}</TabsTrigger>
                <TabsTrigger value="register">{t("tabRegister")}</TabsTrigger>
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
                  {isLogin ? t("signedIn") : t("accountCreated")}
                </div>
                <div className="text-center text-xs text-muted-foreground">
                  {t("redirecting")}
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate={!isLogin}
                className="flex flex-col gap-3.5"
              >
                {errorMessage && (
                  <Alert variant="destructive">
                    <HugeiconsIcon icon={AlertCircleIcon} />
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">{t("emailLabel")}</Label>
                  <InputGroup size="touch">
                    <InputGroupAddon>
                      <HugeiconsIcon icon={Mail01Icon} />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailTaken(false);
                        setServerEmailInvalid(false);
                      }}
                      onBlur={() => setEmailTouched(true)}
                      aria-invalid={emailInvalid || emailTaken}
                      aria-describedby={
                        emailInvalid || emailTaken ? "email-msg" : undefined
                      }
                      placeholder={t("emailPlaceholder")}
                    />
                    {emailOk && (
                      <InputGroupAddon align="inline-end">
                        <HugeiconsIcon icon={Tick02Icon} aria-hidden />
                      </InputGroupAddon>
                    )}
                  </InputGroup>
                  {emailInvalid && (
                    <FieldMessage id="email-msg">
                      {t("emailInvalid")}
                    </FieldMessage>
                  )}
                  {emailTaken && (
                    <FieldMessage id="email-msg" role="alert">
                      {t("emailTaken")}
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        className="h-auto p-0 text-foreground"
                        onClick={() => switchMode("login")}
                      >
                        {t("logInInstead")}
                      </Button>
                    </FieldMessage>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">{t("passwordLabel")}</Label>
                  <InputGroup size="touch">
                    <InputGroupAddon>
                      <HugeiconsIcon icon={LockPasswordIcon} />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete={
                        isLogin ? "current-password" : "new-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={passwordInvalid}
                      aria-describedby={isLogin ? undefined : "password-rules"}
                      placeholder={t("passwordPlaceholder")}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={t("togglePasswordVisibility")}
                        aria-pressed={showPassword}
                      >
                        <HugeiconsIcon
                          icon={showPassword ? ViewOffIcon : ViewIcon}
                        />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {!isLogin && (
                    <PasswordRules
                      id="password-rules"
                      password={password}
                      submitted={submitted}
                    />
                  )}
                </div>

                {!isLogin && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="repeat">{t("repeatPasswordLabel")}</Label>
                    <InputGroup size="touch">
                      <InputGroupAddon>
                        <HugeiconsIcon icon={LockPasswordIcon} />
                      </InputGroupAddon>
                      <InputGroupInput
                        id="repeat"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="new-password"
                        value={repeat}
                        onChange={(e) => setRepeat(e.target.value)}
                        onBlur={() => setRepeatTouched(true)}
                        aria-invalid={mismatch}
                        aria-describedby={mismatch ? "repeat-msg" : undefined}
                        placeholder={t("passwordPlaceholder")}
                      />
                    </InputGroup>
                    {mismatch && (
                      <FieldMessage id="repeat-msg">
                        {t("passwordMismatch")}
                      </FieldMessage>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  size="touch"
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading && <Spinner />}
                  {isLoading
                    ? isLogin
                      ? t("submitLoginLoading")
                      : t("submitRegisterLoading")
                    : isLogin
                      ? t("submitLogin")
                      : t("submitRegister")}
                </Button>

                <div className="text-center text-xs text-muted-foreground">
                  {isLogin ? t("promptNoAccount") : t("promptHasAccount")}{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto p-0 text-foreground"
                    onClick={() => switchMode(isLogin ? "register" : "login")}
                  >
                    {isLogin ? t("linkSignUp") : t("linkLogIn")}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button type="button" variant="ghost" size="sm" onClick={toggleTheme}>
            {dark ? t("switchToLight") : t("switchToDark")}
          </Button>
        </div>
      </div>
    </main>
  );
}

function FieldMessage({
  id,
  role,
  children,
}: {
  id: string;
  role?: "alert";
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role={role}
      className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-destructive"
    >
      <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5 flex-none" />
      {children}
    </div>
  );
}
