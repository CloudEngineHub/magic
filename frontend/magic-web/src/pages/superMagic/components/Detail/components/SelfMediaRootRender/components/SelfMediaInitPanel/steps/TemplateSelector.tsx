import { FileText, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import type { TemplateMeta } from "../../../services/SelfMediaFileStorageService"

interface TemplateSelectorProps {
	templates: TemplateMeta[]
	onLoadTemplate: (templateId: string) => void
	onStartBlank: () => void
}

export default function TemplateSelector({
	templates,
	onLoadTemplate,
	onStartBlank,
}: TemplateSelectorProps) {
	const { t } = useTranslation("super")

	return (
		<div className="mx-auto mb-6 w-full max-w-2xl">
			<div className="mb-5 text-center">
				<h2 className="mb-1 text-2xl font-[820] tracking-normal text-[#18181b]">
					{t("detail.selfMedia.initPanel.template.selectTitle")}
				</h2>
				<p className="text-sm font-semibold text-[#71717a]">
					{t("detail.selfMedia.initPanel.template.selectSubtitle")}
				</p>
			</div>
			<div className="flex flex-col gap-3">
				<Button
					type="button"
					variant="outline"
					className="h-auto justify-start rounded-[24px] border-0 bg-white p-4 text-left shadow-[inset_0_1px_rgba(255,255,255,0.85),0_14px_34px_rgba(24,24,27,0.06)] transition-all hover:-translate-y-0.5 hover:bg-white sm:p-5"
					onClick={onStartBlank}
				>
					<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[#18181b] text-[#ffd637]">
						<Plus size={18} />
					</div>
					<div className="min-w-0">
						<div className="text-base font-[820] text-[#18181b]">空白开始</div>
						<div className="text-sm font-semibold text-[#71717a]">
							从零开始创建新的内容方案
						</div>
					</div>
				</Button>
				{templates.map((tpl) => (
					<Button
						key={tpl.id}
						type="button"
						variant="outline"
						className="h-auto justify-start rounded-[24px] border-0 bg-white p-4 text-left shadow-[inset_0_1px_rgba(255,255,255,0.85),0_14px_34px_rgba(24,24,27,0.06)] transition-all hover:-translate-y-0.5 hover:bg-white sm:p-5"
						onClick={() => onLoadTemplate(tpl.id)}
					>
						<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[#f4f4f5] text-[#18181b]">
							<FileText size={18} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="truncate text-base font-[820] text-[#18181b]">
								{tpl.name}
							</div>
							<div className="text-sm font-semibold text-[#71717a]">
								{t("detail.selfMedia.initPanel.template.articleCount", {
									count: tpl.articleCount,
								})}
							</div>
						</div>
						<span className="shrink-0 rounded-full bg-[#f4f4f5] px-2.5 py-1 text-[11px] font-[780] text-[#71717a]">
							{new Date(tpl.createdAt).toLocaleDateString()}
						</span>
					</Button>
				))}
			</div>
		</div>
	)
}
