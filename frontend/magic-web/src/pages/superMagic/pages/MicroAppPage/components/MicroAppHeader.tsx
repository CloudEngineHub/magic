import { ArrowLeft, Code2, Database, Monitor, Rocket, Smartphone } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { getAttachmentId } from "../utils/microAppFiles"

export type MicroAppPreviewMode = "desktop" | "phone" | "code"

interface MicroAppHeaderProps {
	selectedProject: ProjectListItem | null
	htmlFiles: AttachmentItem[]
	selectedEntryId: string | null
	isDatabasePanelOpen: boolean
	previewMode: MicroAppPreviewMode
	onBack: () => void
	onToggleDatabasePanel: () => void
	onEntryChange: (fileId: string) => void
	onPreviewModeChange: (mode: MicroAppPreviewMode) => void
	onPublish: () => void
}

function getEntryName(item: AttachmentItem): string {
	return item.display_filename || item.file_name || item.filename || item.name || ""
}

export default function MicroAppHeader({
	selectedProject,
	htmlFiles,
	selectedEntryId,
	isDatabasePanelOpen,
	previewMode,
	onBack,
	onToggleDatabasePanel,
	onEntryChange,
	onPreviewModeChange,
	onPublish,
}: MicroAppHeaderProps) {
	const { t } = useTranslation("super")
	const projectName = selectedProject?.project_name || t("project.unnamedProject")
	const hasEntries = htmlFiles.length > 0
	const handlePreviewModeChange = (value: string) => {
		onPreviewModeChange(value as MicroAppPreviewMode)
	}

	return (
		<header
			className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3"
			data-testid="micro-app-header"
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-8 shrink-0"
						onClick={onBack}
					>
						<ArrowLeft size={16} />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">{t("microAppPage.header.backToApps")}</TooltipContent>
			</Tooltip>

			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-foreground">{projectName}</p>
			</div>

			<Tabs
				value={previewMode}
				onValueChange={handlePreviewModeChange}
				data-testid="micro-app-preview-mode-tabs"
			>
				<TabsList className="h-8 rounded-md p-0.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-flex h-full items-center">
								<TabsTrigger
									value="desktop"
									className="h-7 px-2"
									data-testid="micro-app-preview-mode-desktop"
								>
									<Monitor size={16} />
								</TabsTrigger>
							</span>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t("microAppPage.previewMode.default")}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-flex h-full items-center">
								<TabsTrigger
									value="phone"
									className="h-7 px-2"
									data-testid="micro-app-preview-mode-phone"
								>
									<Smartphone size={16} />
								</TabsTrigger>
							</span>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t("microAppPage.previewMode.phone")}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-flex h-full items-center">
								<TabsTrigger
									value="code"
									className="h-7 px-2"
									data-testid="micro-app-preview-mode-code"
								>
									<Code2 size={16} />
								</TabsTrigger>
							</span>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t("microAppPage.previewMode.source")}
						</TooltipContent>
					</Tooltip>
				</TabsList>
			</Tabs>

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={isDatabasePanelOpen ? "secondary" : "outline"}
						size="icon"
						className="size-8 shrink-0"
						onClick={onToggleDatabasePanel}
						disabled={!selectedProject?.id}
						data-testid="micro-app-database-button"
					>
						<Database size={16} />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{isDatabasePanelOpen
						? t("microAppPage.header.hideDatabase")
						: t("microAppPage.header.showDatabase")}
				</TooltipContent>
			</Tooltip>

			{htmlFiles.length > 1 && (
				<div className="flex min-w-[220px] max-w-[360px] shrink-0 items-center gap-2">
					<span className="shrink-0 text-xs text-muted-foreground">
						{t("microAppPage.header.entryLabel")}
					</span>
					<Select
						value={selectedEntryId || undefined}
						onValueChange={onEntryChange}
						disabled={!hasEntries}
					>
						<SelectTrigger className="h-8 min-w-0 flex-1 bg-background">
							<SelectValue placeholder={t("microAppPage.header.entryPlaceholder")} />
						</SelectTrigger>
						<SelectContent align="end" className="max-w-[360px]">
							{htmlFiles.map((item) => {
								const id = getAttachmentId(item)
								return (
									<SelectItem key={id} value={id}>
										<span className="block max-w-[300px] truncate">
											{getEntryName(item)}
										</span>
									</SelectItem>
								)
							})}
						</SelectContent>
					</Select>
				</div>
			)}

			{hasEntries ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="sm"
							className="h-8 shrink-0 gap-2"
							onClick={onPublish}
							data-testid="micro-app-publish-button"
						>
							<Rocket size={14} />
							{t("microAppPage.publish.button")}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("microAppPage.publish.buttonTooltip")}
					</TooltipContent>
				</Tooltip>
			) : null}
		</header>
	)
}
