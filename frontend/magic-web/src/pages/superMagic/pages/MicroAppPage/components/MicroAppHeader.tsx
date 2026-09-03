import { ArrowLeft, PenLine, Rocket, UserRoundPlus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

interface MicroAppHeaderProps {
	selectedProject: ProjectListItem | null
	hasEntries: boolean
	canPublish: boolean
	isPublished?: boolean
	onBack: () => void
	onPublish: () => void
	canEdit?: boolean
	onEdit?: () => void
	canManageCollaborators?: boolean
	onManageCollaborators?: () => void
}

export default function MicroAppHeader({
	selectedProject,
	hasEntries,
	canPublish,
	isPublished = false,
	onBack,
	onPublish,
	canEdit,
	onEdit,
	canManageCollaborators,
	onManageCollaborators,
}: MicroAppHeaderProps) {
	const { t } = useTranslation("super")
	const projectName = selectedProject?.project_name || t("project.unnamedProject")
	const publishButtonLabel = t(
		isPublished ? "microAppPage.publish.published" : "microAppPage.publish.button",
	)
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

			<div className="min-w-0 flex-1">
				{canEdit && onEdit ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="-ml-2 h-8 max-w-full gap-1.5 px-2"
								onClick={onEdit}
								data-testid="micro-app-edit-button"
							>
								<span className="truncate text-sm font-medium">{projectName}</span>
								<PenLine className="size-3.5 shrink-0 text-muted-foreground" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t("microAppPage.edit.button")}
						</TooltipContent>
					</Tooltip>
				) : (
					<p className="truncate text-sm font-medium text-foreground">{projectName}</p>
				)}
			</div>

			{showCollaboratorAction ? (
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
			) : null}

			{hasEntries && canPublish ? (
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
							{publishButtonLabel}
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
