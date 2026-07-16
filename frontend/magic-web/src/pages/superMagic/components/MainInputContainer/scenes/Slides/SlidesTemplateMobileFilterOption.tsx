import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"

interface SlidesTemplateMobileFilterOptionProps {
	label: string
	selected: boolean
	onClick: () => void
	"data-testid"?: string
}

function SlidesTemplateMobileFilterOption({
	label,
	selected,
	onClick,
	"data-testid": dataTestId,
}: SlidesTemplateMobileFilterOptionProps) {
	const labelSizeClass =
		label.length >= 7 ? "text-xs" : label.length >= 5 ? "text-sm" : "text-base"

	return (
		<Button
			type="button"
			variant="ghost"
			className={cn(
				"flex h-auto min-h-12 min-w-0 items-center justify-center rounded-lg border bg-background px-2 py-2 text-center text-foreground shadow-xs transition-colors hover:bg-accent",
				selected ? "border-primary bg-primary/5" : "border-border",
				labelSizeClass,
			)}
			aria-pressed={selected}
			aria-label={label}
			data-testid={dataTestId}
			title={label}
			onClick={onClick}
		>
			<span className="min-w-0 flex-1 truncate whitespace-nowrap text-center leading-5">
				{label}
			</span>
		</Button>
	)
}

export default SlidesTemplateMobileFilterOption
