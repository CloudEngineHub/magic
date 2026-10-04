import type { KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/shadcn-ui/badge"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import CrewFallbackAvatar from "@/pages/superMagic/components/CrewFallbackAvatar"
import ProjectTypeTag from "@/pages/superMagic/components/ProjectTypeTag"
import { SkillThumbnail } from "@/pages/superMagic/components/SkillThumbnail"
import { MagiClawTemplateAvatar } from "@/pages/superMagic/pages/MagiClawPage/MagiClawTemplateAvatar"
import { MagiClawStatusBadge } from "@/pages/superMagic/pages/MagiClawPage/MagiClawStatusBadge"
import MicroAppCardCover from "@/pages/superMagic/pages/MicroAppsPage/components/MicroAppCardCover"
import { ViewMode } from "@/pages/superMagic/components/EmptyWorkspacePanel/components/ProjectItem"
import { IconWorkspaceProjectFolderIcon } from "@/enhance/tabler/icons-react/icons/IconWorkspaceProjectFolder"
import { cn } from "@/utils/cn"

import type { ResourceProject } from "../../resourceProjectTypes"

interface ProjectResourceItemProps {
	project: ResourceProject
	index?: number
	viewMode?: ViewMode
	variant?: "default" | "compact"
	onClick: (project: ResourceProject) => void
	selection?: { checked: boolean; onCheck: () => void }
}

function ResourceIcon({ project }: { project: ResourceProject }) {
	const iconClassName = "size-8 shrink-0 rounded-lg"

	switch (project.resourceType) {
		case "claw":
			return (
				<MagiClawTemplateAvatar
					templateCode={project.resourceTemplateCode as "openclaw" | "magishock" | null}
					src={project.resourceIcon}
					className={cn(iconClassName, "border border-border")}
				/>
			)
		case "micro-app":
			return (
				<MicroAppCardCover
					id={project.resourceId || project.id}
					coverUrl={project.resourceCoverUrl ?? undefined}
					compact
				/>
			)
		case "skill":
			return (
				<SkillThumbnail
					src={project.resourceIcon}
					alt={project.project_name || ""}
					resetKey={project.resourceId}
					iconSize={24}
					className={iconClassName}
				/>
			)
		case "agent":
			return (
				<div
					className={cn(
						iconClassName,
						"flex items-center justify-center bg-muted text-muted-foreground",
					)}
				>
					{project.resourceIcon ? (
						<img
							src={project.resourceIcon}
							alt=""
							className="size-full rounded-lg object-cover"
						/>
					) : (
						<CrewFallbackAvatar iconSize={22} />
					)}
				</div>
			)
		default:
			return <IconWorkspaceProjectFolderIcon size={32} />
	}
}

function ResourceStatus({ project }: { project: ResourceProject }) {
	const { t } = useTranslation("super")
	if (!project.resourceStatus) return null
	if (project.resourceType === "claw") {
		return <MagiClawStatusBadge status={project.resourceStatus} />
	}
	if (project.resourceType === "micro-app") {
		const label =
			project.resourceStatus === "published"
				? t("microAppsPage.statusPublished")
				: t("microAppsPage.statusUnpublished")
		return (
			<Badge variant="outline" className="h-6 rounded-md px-2 text-xs font-normal">
				{label}
			</Badge>
		)
	}
	return null
}

function getDescription(project: ResourceProject) {
	return project.resourceDescription || project.project_description || project.resourceRole
}

export function ProjectResourceItem({
	project,
	index,
	viewMode = ViewMode.GRID,
	variant = "compact",
	onClick,
	selection,
}: ProjectResourceItemProps) {
	const { t } = useTranslation("super")
	const isList = viewMode === ViewMode.LIST
	const name = project.project_name || t("project.unnamedProject")
	const description = getDescription(project)
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return
		if (event.key === "Enter") onClick(project)
		if (event.key === " ") {
			event.preventDefault()
			selection?.onCheck()
		}
	}

	return (
		<div
			className={cn(
				"relative flex min-w-0 cursor-pointer items-center gap-3 border border-border bg-card transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isList
					? "min-h-14 w-full rounded-none border-x-0 border-t-0 px-3 py-2"
					: "min-h-[88px] flex-col items-stretch rounded-lg p-3",
				variant === "default" && "shadow-xs",
				selection?.checked && "border-primary/50 bg-primary/5",
			)}
			role="button"
			tabIndex={0}
			onClick={() => onClick(project)}
			onKeyDown={handleKeyDown}
			data-testid="project-resource-item"
			data-index={index}
			data-view-mode={viewMode}
			data-resource-type={project.resourceType}
		>
			<div className={cn("flex min-w-0 items-center gap-2", !isList && "w-full")}>
				{selection ? (
					<div
						className="shrink-0"
						onClick={(event) => event.stopPropagation()}
						onPointerDown={(event) => event.stopPropagation()}
					>
						<Checkbox
							checked={selection.checked}
							aria-label={t("selectPathModal.selectProject", { name })}
							onCheckedChange={selection.onCheck}
						/>
					</div>
				) : null}
				<ResourceIcon project={project} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<div className="flex min-w-0 items-center gap-1.5">
						<span className="min-w-0 truncate text-sm font-medium text-foreground">
							{name}
						</span>
						<ProjectTypeTag projectMode={project.project_mode} tooltipDisabled />
					</div>
					{description ? (
						<span className="truncate text-xs text-muted-foreground">
							{description}
						</span>
					) : null}
				</div>
			</div>
			<div className={cn("flex shrink-0 items-center gap-2", !isList && "pl-10")}>
				<ResourceStatus project={project} />
			</div>
		</div>
	)
}
