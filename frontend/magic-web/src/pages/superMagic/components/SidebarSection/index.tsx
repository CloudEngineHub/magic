import type { ReactNode } from "react"
import { cn } from "@/utils/cn"
import { SidebarRow } from "./SidebarRow"

export { SidebarRow, SidebarSectionToggle } from "./SidebarRow"
export interface SidebarSectionOptions {
	isExpanded: boolean
	onClick: () => void
	leading?: ReactNode
	description?: ReactNode
	wrapLabel?: boolean
}

export function SidebarExpandableItem({
	label,
	onClick,
	isActive = false,
	isExpanded = false,
	leading,
	trailing,
	testId,
	className,
	contentClassName,
	childrenClassName,
	children,
	header,
	wrapLabel = false,
}: {
	label: string
	onClick: () => void
	isActive?: boolean
	isExpanded?: boolean
	leading?: ReactNode
	trailing?: ReactNode
	testId: string
	className?: string
	contentClassName?: string
	childrenClassName?: string
	children: ReactNode
	header?: ReactNode
	wrapLabel?: boolean
}) {
	return (
		<div className={className} data-testid={`${testId}-section`}>
			{header ?? (
				<SidebarRow
					label={label}
					onClick={onClick}
					isActive={isActive}
					isExpanded={isExpanded}
					leading={leading}
					trailing={trailing}
					testId={testId}
					wrapLabel={wrapLabel}
				/>
			)}
			<div
				className={cn(
					"grid overflow-hidden transition-all duration-200 ease-out",
					isExpanded
						? "grid-rows-[minmax(0,1fr)] opacity-100"
						: "pointer-events-none grid-rows-[0fr] opacity-0",
					contentClassName,
				)}
				data-testid={`${testId}-content`}
			>
				<div
					className={cn(
						"min-h-0 overflow-hidden bg-muted/20 transition-[transform,opacity] duration-200 ease-out",
						isExpanded ? "translate-y-0" : "-translate-y-1",
					)}
				>
					<div
						className={cn(
							"duration-200",
							isExpanded && "animate-in fade-in slide-in-from-top-1",
							childrenClassName,
						)}
					>
						{children}
					</div>
				</div>
			</div>
		</div>
	)
}
