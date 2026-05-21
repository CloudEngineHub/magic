import { useTranslation } from "react-i18next"
import { Bookmark, Sparkles, Check, X } from "lucide-react"

interface SaveConfirmDialogProps {
	onConfirm: () => void
	onCancel: () => void
}

export function SaveConfirmDialog({ onConfirm, onCancel }: SaveConfirmDialogProps) {
	const { t } = useTranslation("super")

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 animate-in fade-in duration-200">
			<div className="w-full max-w-sm rounded-2xl border border-primary/10 bg-background p-6 shadow-2xl animate-in zoom-in-95 duration-200">
				{/* Visual Icon */}
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
					<Bookmark size={20} className="text-primary animate-pulse" />
				</div>

				{/* Slogan */}
				<div className="text-center space-y-2 mb-6">
					<h3 className="text-base font-semibold text-foreground flex items-center justify-center gap-1">
						<span>
							{t(
								"detail.selfMedia.initPanel.stepBrand.saveConfirmTitle",
								"保存品牌信息？",
							)}
						</span>
						<Sparkles size={14} className="text-primary" />
					</h3>
					<p className="text-xs text-muted-foreground leading-relaxed">
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
						className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.98] transition-all"
						onClick={onCancel}
					>
						<X size={12} />
						<span>
							{t("detail.selfMedia.initPanel.stepBrand.saveConfirmSkip", "暂不保存")}
						</span>
					</button>
					<button
						type="button"
						className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-lg active:scale-[0.98] transition-all"
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
