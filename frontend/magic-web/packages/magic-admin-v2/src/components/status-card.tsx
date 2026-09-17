import type { LucideIcon } from "lucide-react";
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@magic-admin-v2/utils/cn";

type StatusCardProps = {
  title: string;
  value: string;
  description?: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "info";
  tooltip?: ReactNode;
};

const toneClassName = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-sky-50 text-sky-700",
};

export function StatusCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "neutral",
  tooltip,
}: StatusCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
            {tooltip ? (
              <span className="group relative inline-flex shrink-0 items-center">
                <CircleHelp className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span
                  className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-64 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-left text-xs font-normal leading-5 text-popover-foreground shadow-md group-hover:block"
                  role="tooltip"
                >
                  {tooltip}
                </span>
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-normal text-foreground">{value}</p>
        </div>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", toneClassName[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </div>
      {description ? <p className="mt-3 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
