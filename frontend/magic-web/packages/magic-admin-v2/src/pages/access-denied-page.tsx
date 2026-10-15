import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@magic-admin-v2/components/empty-state";
import { useTranslation } from "react-i18next";

export default function AccessDeniedPage() {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={ShieldAlert}
      testId="access-denied-empty"
      title={t("accessDenied.title")}
      description={t("accessDenied.description")}
    />
  );
}
