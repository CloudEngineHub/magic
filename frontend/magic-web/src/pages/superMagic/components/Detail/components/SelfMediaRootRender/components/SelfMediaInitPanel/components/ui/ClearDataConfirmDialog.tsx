import { Loader2, RotateCcw } from "lucide-react"
import { type KeyboardEvent, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { selfMediaOverlayStyles } from "../../../selfMediaOverlayStyles"

interface ClearDataConfirmDialogProps {
	open: boolean
	isConfirming?: boolean
	onCancel: () => void
	onConfirm: () => void
}

export default function ClearDataConfirmDialog({
	open,
	isConfirming = false,
	onCancel,
	onConfirm,
}: ClearDataConfirmDialogProps) {
	const { t } = useTranslation("super")
	const cancelButtonRef = useRef<HTMLButtonElement>(null)

	const handleCancel = () => {
		if (isConfirming) return
		onCancel()
	}

	const handleOverlayClick = () => {
		handleCancel()
	}

	const handleOverlayKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== "Escape") return
		event.stopPropagation()
		handleCancel()
	}

	useEffect(() => {
		if (!open) return
		cancelButtonRef.current?.focus()
	}, [open])

	if (!open) return null

	return (
		<div
			className={`absolute inset-0 z-30 flex items-center justify-center ${selfMediaOverlayStyles.manualOverlay}`}
		>
			<button
				type="button"
				className="absolute inset-0 cursor-default"
				aria-disabled={isConfirming}
				aria-label={t("detail.selfMedia.initPanel.clearConfirm.cancel")}
				data-testid="self-media-clear-confirm-overlay"
				onClick={handleOverlayClick}
				onKeyDown={handleOverlayKeyDown}
				tabIndex={-1}
			/>
			<div
				role="dialog"
				aria-modal="true"
				className={`z-10 grid gap-4 ${selfMediaOverlayStyles.manualPanel}`}
				data-testid="self-media-clear-confirm-dialog"
			>
				<div className="grid place-items-center gap-2 text-center">
					<div className="mb-1 inline-flex size-10 items-center justify-center rounded-[18px] bg-white text-destructive shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]">
						<RotateCcw className="size-5" />
					</div>
					<h2 className="text-base font-[780] text-[#18181b]">
						{t("detail.selfMedia.initPanel.clearConfirm.title")}
					</h2>
					<p className="text-balance text-sm text-[#71717a]">
						{t("detail.selfMedia.initPanel.clearConfirm.description")}
					</p>
				</div>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<Button
						ref={cancelButtonRef}
						type="button"
						variant="outline"
						className={selfMediaOverlayStyles.secondaryButton}
						onClick={handleCancel}
						disabled={isConfirming}
						data-testid="self-media-clear-confirm-cancel"
					>
						{t("detail.selfMedia.initPanel.clearConfirm.cancel")}
					</Button>
					<Button
						type="button"
						className={selfMediaOverlayStyles.primaryButton}
						onClick={onConfirm}
						disabled={isConfirming}
						aria-busy={isConfirming}
						data-testid="self-media-clear-confirm-confirm"
					>
						{isConfirming ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : null}
						{t(
							isConfirming
								? "detail.selfMedia.initPanel.clearConfirm.clearing"
								: "detail.selfMedia.initPanel.clearConfirm.confirm",
						)}
					</Button>
				</div>
			</div>
		</div>
	)
}
