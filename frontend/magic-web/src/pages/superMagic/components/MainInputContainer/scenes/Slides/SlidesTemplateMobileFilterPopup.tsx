import type { ReactNode } from "react"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"

interface SlidesTemplateMobileFilterPopupAction {
	label: string
	onClick: () => void
	disabled?: boolean
	testId?: string
}

interface SlidesTemplateMobileFilterPopupHeaderAction {
	icon: ReactNode
	ariaLabel: string
	onClick: () => void
	disabled?: boolean
	testId?: string
}

interface SlidesTemplateMobileFilterPopupProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	children: ReactNode
	className?: string
	contentClassName?: string
	headerTrailingAction?: SlidesTemplateMobileFilterPopupHeaderAction
	secondaryAction?: SlidesTemplateMobileFilterPopupAction
	confirmAction?: SlidesTemplateMobileFilterPopupAction
}

function SlidesTemplateMobileFilterPopup({
	open,
	onOpenChange,
	title,
	children,
	className,
	contentClassName,
	headerTrailingAction,
	secondaryAction,
	confirmAction,
}: SlidesTemplateMobileFilterPopupProps) {
	const { t } = useTranslation()
	const closeLabel = t("shadcn-ui:actionDrawer.close")

	function handleClose() {
		onOpenChange(false)
	}

	return (
		<MagicPopup
			visible={open}
			onOpenChange={onOpenChange}
			onClose={handleClose}
			position="bottom"
			title={title}
			headerVariant="actionHeader"
			headerTitle={title}
			headerLeadingAction={{
				icon: <X />,
				ariaLabel: closeLabel,
				onClick: handleClose,
			}}
			headerTrailingAction={headerTrailingAction}
			className={cn("max-h-[85dvh] rounded-t-[14px] border-0 bg-muted p-0", className)}
			bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
			style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
		>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div
					className={cn(
						"flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-2",
						contentClassName,
					)}
				>
					{children}
				</div>
				{secondaryAction && confirmAction ? (
					<div className="flex shrink-0 gap-1.5 px-3 pb-3">
						<Button
							variant="outline"
							className="h-9 flex-[30%] shrink-0"
							onClick={secondaryAction.onClick}
							disabled={secondaryAction.disabled}
							data-testid={secondaryAction.testId}
						>
							{secondaryAction.label}
						</Button>
						<Button
							className="h-9 flex-[70%] shrink-0"
							onClick={confirmAction.onClick}
							disabled={confirmAction.disabled}
							data-testid={confirmAction.testId}
						>
							{confirmAction.label}
						</Button>
					</div>
				) : null}
			</div>
		</MagicPopup>
	)
}

export default SlidesTemplateMobileFilterPopup
