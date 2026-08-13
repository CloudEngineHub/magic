import { Check } from "lucide-react"
import type { CSSProperties, ReactNode, RefCallback } from "react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "../../primitives/shadcn/popover"

export type LinkedFrameRole = "start" | "end"

export interface LinkedFrameAssignmentOption {
	role: LinkedFrameRole
	label: string
	selected: boolean
	disabled?: boolean
	title?: string
}

interface LinkedFrameAssignmentPopoverProps {
	options: LinkedFrameAssignmentOption[]
	className: string
	style: CSSProperties
	content: ReactNode
	slotRootRef?: RefCallback<HTMLDivElement | null>
	onToggleRole: (role: LinkedFrameRole, selected: boolean) => void
}

/** 纯交互组件：关联媒体卡片的首尾帧角色选择菜单。 */
export default function LinkedFrameAssignmentPopover(props: LinkedFrameAssignmentPopoverProps) {
	const { options, className, style, content, slotRootRef, onToggleRole } = props
	const [open, setOpen] = useState(false)

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<div ref={slotRootRef} className={className} style={style}>
					{content}
				</div>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-44 p-1"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<div className="flex flex-col gap-0.5">
					{options.map((option) => (
						<button
							key={option.role}
							type="button"
							className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50"
							disabled={option.disabled}
							title={option.title}
							aria-pressed={option.selected}
							onClick={() => {
								onToggleRole(option.role, option.selected)
								setOpen(false)
							}}
						>
							<span className="flex h-4 w-4 items-center justify-center">
								{option.selected ? <Check size={13} aria-hidden /> : null}
							</span>
							<span>{option.label}</span>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}
