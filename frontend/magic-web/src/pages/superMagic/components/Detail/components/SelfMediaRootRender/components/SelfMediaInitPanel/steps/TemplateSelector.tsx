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
		<div className="mx-auto mb-6 max-w-lg">
			<div className="mb-4 text-center">
				<h2 className="mb-1 text-lg font-semibold tracking-tight text-foreground">
					{t("detail.selfMedia.initPanel.template.selectTitle")}
				</h2>
				<p className="text-xs text-muted-foreground">
					{t("detail.selfMedia.initPanel.template.selectSubtitle")}
				</p>
			</div>
			<div className="flex flex-col gap-3">
				<Button
					type="button"
					variant="outline"
					className="h-auto justify-start rounded-lg border bg-card p-4 text-left shadow-xs hover:bg-accent/50"
					onClick={onStartBlank}
				>
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
						<Plus size={18} />
					</div>
					<div className="min-w-0">
						<div className="text-sm font-medium">空白开始</div>
						<div className="text-xs text-muted-foreground">
							从零开始创建新的内容方案
						</div>
					</div>
				</Button>
				{templates.map((tpl) => (
					<Button
						key={tpl.id}
						type="button"
						variant="outline"
						className="h-auto justify-start rounded-lg border bg-card p-4 text-left shadow-xs hover:bg-accent/50"
						onClick={() => onLoadTemplate(tpl.id)}
					>
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
							<FileText size={18} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium">{tpl.name}</div>
							<div className="text-xs text-muted-foreground">
								{t("detail.selfMedia.initPanel.template.articleCount", {
									count: tpl.articleCount,
								})}
							</div>
						</div>
						<span className="shrink-0 text-[10px] text-muted-foreground/60">
							{new Date(tpl.createdAt).toLocaleDateString()}
						</span>
					</Button>
				))}
			</div>
		</div>
	)
}
