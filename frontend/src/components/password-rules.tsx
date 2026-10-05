import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  InformationCircleIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import {
  checkPassword,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from "@/lib/password";
import { cn } from "@/lib/utils";

const RULES = ["length", "upper", "lower", "digit", "special"] as const;

// Hint (muted) -> met (tick) -> unmet after a submit attempt (destructive).
export function PasswordRules({
  id,
  password,
  submitted,
}: {
  id: string;
  password: string;
  submitted: boolean;
}) {
  const t = useTranslations("PasswordRules");
  const check = checkPassword(password);

  return (
    <ul id={id} aria-live="polite" className="flex flex-col gap-0.5 text-xs">
      {RULES.map((rule) => {
        const tooLong = rule === "length" && check.tooLong;
        const met = check[rule] && !tooLong;
        const failed = tooLong || (!met && submitted);
        return (
          <li
            key={rule}
            data-met={met}
            className={cn(
              "flex items-start gap-1.5",
              failed ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <HugeiconsIcon
              icon={
                failed
                  ? AlertCircleIcon
                  : met
                    ? Tick02Icon
                    : InformationCircleIcon
              }
              className="mt-px size-3.5 flex-none"
              aria-hidden
            />
            <span>
              {rule === "length"
                ? tooLong
                  ? t("tooLong", { max: MAX_PASSWORD_BYTES })
                  : t("length", { min: MIN_PASSWORD_LENGTH })
                : t(rule)}
              <span className="sr-only"> {met ? t("met") : t("unmet")}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
