import type { LucideIcon } from "lucide-react";
import { Button } from "@magic-admin-v2/components/ui/button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
};

export function EmptyState({ icon: Icon, title, description, actionLabel }: EmptyStateProps) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg bg-card px-6 py-10 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-md border bg-background">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel ? (
        <Button className="mt-5" variant="outline" disabled>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
