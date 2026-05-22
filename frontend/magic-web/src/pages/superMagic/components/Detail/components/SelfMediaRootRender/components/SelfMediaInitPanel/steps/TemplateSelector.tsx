import { useTranslation } from "react-i18next"
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
				<h2 className="mb-1 text-lg font-bold">
					{t("detail.selfMedia.initPanel.template.selectTitle")}
				</h2>
				<p className="text-xs text-muted-foreground">
					{t("detail.selfMedia.initPanel.template.selectSubtitle")}
				</p>
			</div>
			<div className="flex flex-col gap-3">
				<button
					type="button"
					className="flex items-center gap-3 border-l-2 border-primary/40 bg-background p-4 text-left transition-all hover:bg-primary/[0.03] active:scale-[0.99]"
					onClick={onStartBlank}
				>
					<div className="flex h-10 w-10 items-center justify-center bg-muted">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="text-muted-foreground"
						>
							<line x1="12" y1="5" x2="12" y2="19" />
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
					</div>
					<div>
						<div className="text-sm font-medium">空白开始</div>
						<div className="text-xs text-muted-foreground">
							从零开始创建新的内容方案
						</div>
					</div>
				</button>
				{templates.map((tpl) => (
					<button
						key={tpl.id}
						type="button"
						className="flex items-center gap-3 border-l-2 border-zinc-950/10 bg-background p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] active:scale-[0.99]"
						onClick={() => onLoadTemplate(tpl.id)}
					>
						<div className="flex h-10 w-10 items-center justify-center bg-primary/10">
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-primary"
							>
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
							</svg>
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
					</button>
				))}
			</div>
		</div>
	)
}
