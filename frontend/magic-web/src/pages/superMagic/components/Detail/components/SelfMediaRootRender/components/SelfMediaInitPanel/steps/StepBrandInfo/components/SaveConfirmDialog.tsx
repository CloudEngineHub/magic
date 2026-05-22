import { useTranslation } from "react-i18next"
import { Bookmark, Sparkles, Check, X } from "lucide-react"

interface SaveConfirmDialogProps {
	onConfirm: () => void
	onCancel: () => void
}

export function SaveConfirmDialog({ onConfirm, onCancel }: SaveConfirmDialogProps) {
	const { t } = useTranslation("super")

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm duration-200 animate-in fade-in">
			<div className="w-full max-w-sm border-t-2 border-primary bg-background p-6 shadow-2xl duration-200 animate-in zoom-in-95">
				{/* Visual Icon */}
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center bg-primary/10 text-primary">
					<Bookmark size={20} className="animate-pulse text-primary" />
				</div>

				{/* Slogan */}
				<div className="mb-6 space-y-2 text-center">
					<h3 className="flex items-center justify-center gap-1 text-base font-semibold text-foreground">
						<span>
							{t(
								"detail.selfMedia.initPanel.stepBrand.saveConfirmTitle",
								"保存品牌信息？",
							)}
						</span>
						<Sparkles size={14} className="text-primary" />
					</h3>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t(
							"detail.selfMedia.initPanel.stepBrand.saveConfirmDesc",
							"是否将当前品牌信息保存为历史记录，方便下次快速一键回填？",
						)}
					</p>
				</div>

				{/* Button Group */}
				<div className="flex gap-3">
					<button
						type="button"
						className="flex flex-1 items-center justify-center gap-1.5 border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-[0.98]"
						onClick={onCancel}
					>
						<X size={12} />
						<span>
							{t("detail.selfMedia.initPanel.stepBrand.saveConfirmSkip", "暂不保存")}
						</span>
					</button>
					<button
						type="button"
						className="flex flex-1 items-center justify-center gap-1.5 bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
						onClick={onConfirm}
					>
						<Check size={12} />
						<span>
							{t(
								"detail.selfMedia.initPanel.stepBrand.saveConfirmSave",
								"保存并继续",
							)}
						</span>
					</button>
				</div>
			</div>
		</div>
	)
}
