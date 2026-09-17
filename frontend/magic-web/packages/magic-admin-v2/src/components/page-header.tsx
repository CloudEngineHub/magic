import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  titleAddon?: ReactNode;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, titleAddon, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {titleAddon}
        </div>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {/* Wrap dense action groups so page headers do not widen the viewport on narrow screens. */}
      {actions ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
