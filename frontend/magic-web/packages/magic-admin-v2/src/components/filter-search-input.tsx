import { Search, X } from "lucide-react";
import { Input, type InputProps } from "@magic-admin-v2/components/ui/input";
import { cn } from "@magic-admin-v2/utils/cn";

type FilterSearchInputProps = Omit<InputProps, "onChange" | "value"> & {
  clearLabel: string;
  containerClassName?: string;
  onValueChange: (value: string) => void;
  value: string;
};

export function FilterSearchInput({
  className,
  clearLabel,
  containerClassName,
  disabled,
  onValueChange,
  readOnly,
  value,
  ...inputProps
}: FilterSearchInputProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        {...inputProps}
        className={cn("pl-9 pr-9", className)}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        readOnly={readOnly}
        value={value}
      />
      {value && !disabled && !readOnly ? (
        <button
          aria-label={clearLabel}
          className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onValueChange("")}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
