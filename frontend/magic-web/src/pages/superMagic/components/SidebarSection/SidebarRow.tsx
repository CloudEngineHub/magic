import type { ReactNode, RefObject } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/utils/cn"

export function SidebarSectionToggle({
	label,
	isExpanded,
	onClick,
	disabled = false,
}: {
	label: string
	isExpanded: boolean
	onClick: () => void
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			aria-label={label}
			aria-expanded={isExpanded}
			data-header-chevron
			className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
		>
			<ChevronRight
				className={cn(
					"h-4 w-4 transition-transform duration-200 ease-out",
					isExpanded && "rotate-90",
				)}
			/>
		</button>
	)
}

export interface SidebarRowProps {
	label: string
	onClick: () => void
	isActive?: boolean
	isExpanded?: boolean
	disabled?: boolean
	hideChevron?: boolean
	leading?: ReactNode
	trailing?: ReactNode
	testId: string
	className?: string
	rowRef?: RefObject<HTMLDivElement>
	labelRef?: RefObject<HTMLSpanElement>
}

export function SidebarRow({
	label,
	onClick,
	isActive = false,
	isExpanded = false,
	disabled = false,
	hideChevron = false,
	leading,
	trailing,
	testId,
	className,
	rowRef,
	labelRef,
}: SidebarRowProps) {
	return (
		<div
			ref={rowRef}
			className={cn(
				"flex h-10 w-full items-center gap-2 overflow-hidden px-2.5 text-left transition-[background-color,box-shadow] duration-200 ease-out hover:bg-accent/40",
				isActive && "bg-accent/50",
				disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
				className,
			)}
		>
			{/* 标题与工具按钮并列，避免嵌套 button；操作菜单不会触发分组折叠。 */}
			<button
				type="button"
				disabled={disabled}
				onClick={onClick}
				aria-expanded={hideChevron ? undefined : isExpanded}
				data-testid={testId}
				className="flex min-w-0 flex-1 items-center gap-2 self-stretch overflow-hidden text-left"
			>
				{leading && (
					<div
						data-header-leading
						className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
					>
						{leading}
					</div>
				)}
				<p className="min-w-0 truncate text-sm font-medium text-foreground">
					<span ref={labelRef} className="inline-block whitespace-nowrap">
						{label}
					</span>
				</p>
			</button>
			{trailing && (
				<div
					className="flex shrink-0 items-center gap-1"
					onClick={(event) => event.stopPropagation()}
					data-testid="sidebar-row"
				>
					{trailing}
				</div>
			)}
			{hideChevron ? null : (
				<SidebarSectionToggle
					label={label}
					disabled={disabled}
					onClick={onClick}
					isExpanded={isExpanded}
				/>
			)}
		</div>
	)
}
