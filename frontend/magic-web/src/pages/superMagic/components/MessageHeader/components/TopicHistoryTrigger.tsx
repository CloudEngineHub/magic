import type { ReactNode } from "react"
import { History } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { MagicTooltip } from "@/components/base"
import { cn } from "@/utils/cn"

export interface TopicHistoryTriggerProps {
	mode: "dropdown" | "layout"
	isActive: boolean
	tooltipTitle: string
	onToggle?: () => void
	renderDropdown?: (trigger: ReactNode) => ReactNode
}

const headerIconButtonClassName = "!size-6 !min-h-6 !min-w-6 !rounded-md !p-0"

export function TopicHistoryTrigger({
	mode,
	isActive,
	tooltipTitle,
	onToggle,
	renderDropdown,
}: TopicHistoryTriggerProps) {
	const button = (
		<Button
			variant="ghost"
			size="icon-sm"
			className={cn(headerIconButtonClassName, isActive && "bg-accent")}
			data-testid="message-header-history-button"
			onClick={mode === "layout" ? onToggle : undefined}
		>
			<History size={16} className="shrink-0 text-foreground" />
		</Button>
	)
	// Radix DropdownMenuTrigger must receive the ref-forwarding Button directly;
	// placing MagicTooltip between them drops the injected pointer and keyboard handlers.
	const trigger = mode === "dropdown" ? (renderDropdown?.(button) ?? button) : button

	return (
		<MagicTooltip title={tooltipTitle}>
			<span>{trigger}</span>
		</MagicTooltip>
	)
}
