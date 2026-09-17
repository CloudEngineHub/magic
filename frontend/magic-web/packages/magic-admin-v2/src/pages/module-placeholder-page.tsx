import { Boxes } from "lucide-react";
import { EmptyState } from "@magic-admin-v2/components/empty-state";
import { PageHeader } from "@magic-admin-v2/components/page-header";
import { Button } from "@magic-admin-v2/components/ui/button";
import { Separator } from "@magic-admin-v2/components/ui/separator";
import { useTranslation } from "react-i18next";

type ModulePlaceholderPageProps = {
  titleKey: string;
  descriptionKey: string;
};

export default function ModulePlaceholderPage({
  titleKey,
  descriptionKey,
}: ModulePlaceholderPageProps) {
  const { t } = useTranslation();

  return (
    <div className="-m-4 px-4 py-6 lg:px-6">
      <PageHeader
        title={t(titleKey)}
        description={t(descriptionKey)}
        actions={
          <Button disabled>
            <Boxes className="size-4" aria-hidden="true" />
            {t("common.modulePending")}
          </Button>
        }
      />

      <Separator className="my-4 lg:my-6" />

      <div className="mt-2 pb-6">
        <EmptyState
          icon={Boxes}
          title={t("modulePlaceholder.title")}
          description={t("modulePlaceholder.description")}
        />
      </div>
    </div>
  );
}
