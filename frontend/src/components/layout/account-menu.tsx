import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Logout01Icon,
  Moon01Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
import { logout, setAccessToken } from "@/lib/api";

// The items of the account menu; the sidebar footer and the mobile top bar
// each wrap them in their own DropdownMenu.
export function AccountMenuItems() {
  const t = useTranslations("AppSidebar");
  const router = useRouter();
  const { dark, toggleTheme } = useTheme();

  async function handleSignOut() {
    try {
      await logout();
    } finally {
      setAccessToken(null);
      router.replace("/login");
    }
  }

  return (
    <>
      <DropdownMenuItem onClick={toggleTheme}>
        <HugeiconsIcon icon={dark ? Sun01Icon : Moon01Icon} />
        {t("toggleTheme")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleSignOut}>
        <HugeiconsIcon icon={Logout01Icon} />
        {t("signOut")}
      </DropdownMenuItem>
    </>
  );
}
