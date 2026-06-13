import { FileClock, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

export default function DraftLoadingState() {
	const { t } = useTranslation("super")

	return (
		<div
			className="flex min-h-0 flex-1 items-center justify-center bg-transparent px-4"
			data-testid="self-media-init-panel-draft-loading"
		>
			<div className="grid w-full max-w-[360px] place-items-center gap-3 rounded-[26px] bg-white/[0.92] px-6 py-7 text-center shadow-[0_24px_72px_rgba(24,24,27,0.12),inset_0_1px_rgba(255,255,255,0.86)]">
				<div className="relative inline-flex size-12 items-center justify-center rounded-[20px] bg-[#f4f4f5] text-[#18181b]">
					<FileClock className="size-5" aria-hidden="true" />
					<div className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full bg-white shadow-[0_6px_16px_rgba(24,24,27,0.12)]">
						<Loader2 className="size-3 animate-spin" aria-hidden="true" />
					</div>
				</div>
				<div className="space-y-1.5">
					<p className="text-base font-[800] leading-tight text-[#18181b]">
						{t("detail.selfMedia.initPanel.draft.loading")}
					</p>
					<p className="text-xs font-medium text-[#71717a]">
						{t("detail.selfMedia.initPanel.draft.restore")}
					</p>
				</div>
			</div>
		</div>
	)
}
