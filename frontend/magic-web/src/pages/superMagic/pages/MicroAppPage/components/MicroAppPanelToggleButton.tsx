import type { ReactNode } from "react"
import { Button } from "@/components/shadcn-ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"

interface MicroAppPanelToggleButtonProps {
	icon: ReactNode
	label: string
	testId: string
	onClick: () => void
	side?: "left" | "right" | "bottom"
}

export default function MicroAppPanelToggleButton({
	icon,
	label,
	testId,
	onClick,
	side = "bottom",
}: MicroAppPanelToggleButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8"
					onClick={onClick}
					data-testid={testId}
				>
					{icon}
				</Button>
			</TooltipTrigger>
			<TooltipContent side={side}>{label}</TooltipContent>
		</Tooltip>
	)
}
