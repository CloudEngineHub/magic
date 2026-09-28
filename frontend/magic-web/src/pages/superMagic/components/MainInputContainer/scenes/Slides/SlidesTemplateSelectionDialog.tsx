import type { ReactNode } from "react"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"

interface SlidesTemplateSelectionDialogProps {
	open: boolean
	title: ReactNode
	description?: ReactNode
	onOpenChange: (open: boolean) => void
	children: ReactNode
	footer?: ReactNode
}

/** Shared fixed-size dialog shell for every slide-template selection flow. */
export default function SlidesTemplateSelectionDialog({
	open,
	title,
	description,
	onOpenChange,
	children,
	footer,
}: SlidesTemplateSelectionDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[760px] max-h-[calc(100vh-32px)] w-[min(90vw,1200px)] !max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
				<DialogHeader className="shrink-0 border-b px-6 py-4">
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<p className="text-sm text-muted-foreground">{description}</p>
					) : null}
				</DialogHeader>
				{/* Keep reused selector content aligned with the header and inset from dialog edges. */}
				<div className="min-h-0 flex-1 overflow-hidden px-6 pb-6 pt-3">{children}</div>
				{footer ? (
					<DialogFooter className="shrink-0 border-t px-6 py-4 sm:items-center">
						{footer}
					</DialogFooter>
				) : null}
			</DialogContent>
		</Dialog>
	)
}
