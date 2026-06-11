import { useTranslation } from "react-i18next"
import { Bookmark, Sparkles, Check, X } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"

interface SaveConfirmDialogProps {
	onConfirm: () => void
	onCancel: () => void
}

export function SaveConfirmDialog({ onConfirm, onCancel }: SaveConfirmDialogProps) {
	const { t } = useTranslation("super")

	return (
		<div
			aria-modal="true"
			className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#111827]/55 p-4 backdrop-blur-md duration-200 animate-in fade-in"
			data-testid="self-media-save-confirm-overlay"
			role="dialog"
		>
			<div
				className="relative w-full max-w-sm overflow-hidden rounded-lg bg-background/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.24)] backdrop-blur-xl duration-200 animate-in zoom-in-95 slide-in-from-bottom-2"
				data-testid="self-media-save-confirm-panel"
			>
				<div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#434c81]/25 to-transparent" />
				<div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[#434c81]/[0.075] blur-3xl" />

				<div
					className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-[#434c81]/[0.10] text-[#38426f] shadow-[inset_0_0_0_1px_rgba(67,76,129,0.08)]"
					data-testid="self-media-save-confirm-icon"
				>
					<Bookmark size={20} className="text-[#38426f]" />
				</div>

				<div className="relative mb-6 space-y-2 text-center">
					<h3 className="flex items-center justify-center gap-1 text-base font-semibold text-foreground">
						<span>
							{t(
								"detail.selfMedia.initPanel.stepBrand.saveConfirmTitle",
								"保存品牌信息？",
							)}
						</span>
						<Sparkles size={13} className="text-[#434c81]" />
					</h3>
					<p className="mx-auto max-w-[18rem] text-xs leading-relaxed text-muted-foreground">
						{t(
							"detail.selfMedia.initPanel.stepBrand.saveConfirmDesc",
							"是否将当前品牌信息保存为历史记录，方便下次快速一键回填？",
						)}
					</p>
				</div>

				<div className="relative flex flex-col gap-2 sm:flex-row sm:gap-3">
					<Button
						type="button"
						variant="ghost"
						className="h-10 flex-1 bg-background/70 text-foreground shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-background hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
						data-testid="self-media-save-confirm-cancel"
						onClick={onCancel}
					>
						<X size={12} />
						<span>
							{t("detail.selfMedia.initPanel.stepBrand.saveConfirmSkip", "暂不保存")}
						</span>
					</Button>
					<Button
						type="button"
						className="h-10 flex-1 bg-[#161b27] text-white shadow-[0_10px_28px_rgba(15,23,42,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#202638] hover:shadow-[0_14px_34px_rgba(15,23,42,0.24)]"
						data-testid="self-media-save-confirm-confirm"
						onClick={onConfirm}
					>
						<Check size={12} />
						<span>
							{t(
								"detail.selfMedia.initPanel.stepBrand.saveConfirmSave",
								"保存并继续",
							)}
						</span>
					</Button>
				</div>
			</div>
		</div>
	)
}
