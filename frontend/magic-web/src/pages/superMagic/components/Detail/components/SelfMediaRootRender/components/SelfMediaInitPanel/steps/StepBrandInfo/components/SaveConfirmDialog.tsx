import { useEffect, useId, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Bookmark, Sparkles, Check, Loader2, X } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { selfMediaOverlayStyles } from "../../../../selfMediaOverlayStyles"

interface SaveConfirmDialogProps {
	isConfirming?: boolean
	onConfirm: () => void
	onCancel: () => void
}

export function SaveConfirmDialog({
	isConfirming = false,
	onConfirm,
	onCancel,
}: SaveConfirmDialogProps) {
	const { t } = useTranslation("super")
	const titleId = useId()
	const descriptionId = useId()
	const confirmButtonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		confirmButtonRef.current?.focus()
	}, [])

	return (
		<div
			aria-describedby={descriptionId}
			aria-labelledby={titleId}
			aria-modal="true"
			className={`fixed inset-0 z-[1000] flex items-center justify-center ${selfMediaOverlayStyles.manualOverlay}`}
			data-testid="self-media-save-confirm-overlay"
			role="dialog"
		>
			<div
				className={selfMediaOverlayStyles.manualPanel}
				data-testid="self-media-save-confirm-panel"
			>
				<div
					className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[18px] bg-white text-[#18181b] shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]"
					data-testid="self-media-save-confirm-icon"
				>
					<Bookmark size={20} className="text-[#18181b]" />
				</div>

				<div className="relative mb-6 space-y-2 text-center">
					<h3
						id={titleId}
						className="flex items-center justify-center gap-1 text-base font-[780] text-[#18181b]"
					>
						<span>
							{t(
								"detail.selfMedia.initPanel.stepBrand.saveConfirmTitle",
								"下次还用这套品牌信息吗？",
							)}
						</span>
						<Sparkles size={13} className="text-[#18181b]" />
					</h3>
					<p
						id={descriptionId}
						className="mx-auto max-w-[18rem] text-xs leading-relaxed text-[#71717a]"
					>
						{t(
							"detail.selfMedia.initPanel.stepBrand.saveConfirmDesc",
							"保存后，下次新建文章可一键回填。",
						)}
					</p>
				</div>

				<div className="relative flex flex-col gap-2 sm:flex-row sm:gap-3">
					<Button
						type="button"
						variant="ghost"
						className={`h-10 flex-1 ${selfMediaOverlayStyles.secondaryButton}`}
						data-testid="self-media-save-confirm-cancel"
						onClick={onCancel}
						disabled={isConfirming}
					>
						<X size={12} />
						<span>
							{t(
								"detail.selfMedia.initPanel.stepBrand.saveConfirmSkip",
								"不保存，继续",
							)}
						</span>
					</Button>
					<Button
						ref={confirmButtonRef}
						type="button"
						className={`h-10 flex-1 ${selfMediaOverlayStyles.primaryButton}`}
						data-testid="self-media-save-confirm-confirm"
						onClick={onConfirm}
						disabled={isConfirming}
						aria-busy={isConfirming}
					>
						{isConfirming ? (
							<Loader2 size={12} className="animate-spin" aria-hidden="true" />
						) : (
							<Check size={12} />
						)}
						<span>
							{t(
								isConfirming
									? "detail.selfMedia.initPanel.stepBrand.saveConfirmSaving"
									: "detail.selfMedia.initPanel.stepBrand.saveConfirmSave",
								isConfirming ? "正在保存" : "保存，继续",
							)}
						</span>
					</Button>
				</div>
			</div>
		</div>
	)
}
