import { ArrowLeft, Files, PanelLeftClose, UserRoundPlus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { getAttachmentId } from "../utils/microAppFiles"

interface MicroAppHeaderProps {
	selectedProject: ProjectListItem | null
	htmlFiles: AttachmentItem[]
	selectedEntryId: string | null
	isSidebarOpen: boolean
	onBack: () => void
	onToggleSidebar: () => void
	onEntryChange: (fileId: string) => void
	canManageCollaborators?: boolean
	onManageCollaborators?: () => void
}

function getEntryName(item: AttachmentItem): string {
	return item.display_filename || item.file_name || item.filename || item.name || ""
}

export default function MicroAppHeader({
	selectedProject,
	htmlFiles,
	selectedEntryId,
	isSidebarOpen,
	onBack,
	onToggleSidebar,
	onEntryChange,
	canManageCollaborators,
	onManageCollaborators,
}: MicroAppHeaderProps) {
	const { t } = useTranslation("super")
	const projectName = selectedProject?.project_name || t("project.unnamedProject")
	const hasEntries = htmlFiles.length > 0
	const showCollaboratorAction = Boolean(canManageCollaborators && onManageCollaborators)

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

			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={isSidebarOpen ? "secondary" : "outline"}
						size="icon"
						className="size-8 shrink-0"
						onClick={onToggleSidebar}
					>
						{isSidebarOpen ? <PanelLeftClose size={16} /> : <Files size={16} />}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{isSidebarOpen
						? t("microAppPage.header.hideFiles")
						: t("microAppPage.header.showFiles")}
				</TooltipContent>
			</Tooltip>

			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-foreground">{projectName}</p>
			</div>

			{showCollaboratorAction && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="size-8 shrink-0"
							aria-label={t("project.addCollaborators")}
							data-testid="micro-app-manage-collaborators"
							onClick={() => onManageCollaborators?.()}
						>
							<UserRoundPlus size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{t("project.addCollaborators")}</TooltipContent>
				</Tooltip>
			)}

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
		</header>
	)
}
