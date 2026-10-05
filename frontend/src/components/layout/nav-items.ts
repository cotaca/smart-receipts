import { useTranslations } from "next-intl";
import {
  DashboardSquare01Icon,
  Invoice01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";

// Shared by the sidebar and the mobile bottom nav. Order matches the
// ReceiptsDesktop mockup's Workspace group.
export function useNavItems() {
  const t = useTranslations("AppSidebar");
  return [
    {
      href: "/dashboard",
      label: t("navDashboard"),
      icon: DashboardSquare01Icon,
    },
    { href: "/receipts", label: t("navReceipts"), icon: Invoice01Icon },
    { href: "/settings", label: t("navSettings"), icon: Settings01Icon },
  ];
}
