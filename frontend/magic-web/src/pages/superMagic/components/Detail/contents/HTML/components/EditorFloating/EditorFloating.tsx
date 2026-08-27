import * as React from "react"
import { SelectContent } from "@/components/shadcn-ui/select"
import { DropdownMenuContent } from "@/components/shadcn-ui/dropdown-menu"
import { PopoverContent } from "@/components/shadcn-ui/popover"
import { cn } from "@/utils/cn"
import { TAILWIND_Z_INDEX_CLASSES } from "../../constants/z-index"

type SelectContentProps = React.ComponentProps<typeof SelectContent>
type DropdownMenuContentProps = React.ComponentProps<typeof DropdownMenuContent>
type PopoverContentProps = React.ComponentProps<typeof PopoverContent>

/** Shared layer defaults for menus rendered by the HTML editor. */
export function EditorSelectContent({ className, ...props }: SelectContentProps) {
	return (
		<SelectContent
			{...props}
			className={cn(TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.SELECT, className)}
		/>
	)
}

/** Shared layer defaults for dropdown menus rendered by the HTML editor. */
export function EditorDropdownMenuContent({ className, ...props }: DropdownMenuContentProps) {
	return (
		<DropdownMenuContent
			{...props}
			className={cn(TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.DROPDOWN, className)}
		/>
	)
}

/** Shared layer defaults for popovers rendered by the HTML editor. */
export function EditorPopoverContent({ className, ...props }: PopoverContentProps) {
	return (
		<PopoverContent
			{...props}
			className={cn(TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.POPOVER, className)}
		/>
	)
}
