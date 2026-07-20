import { ArrowLeft, Database, Rocket, UserRoundPlus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/shadcn-ui/button"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

interface MicroAppMobileHeaderProps {
	selectedProject: ProjectListItem | null
	hasEntries: boolean
	isDatabasePanelOpen: boolean
	onBack: () => void
	onToggleDatabasePanel: () => void
	onPublish: () => void
	canManageCollaborators?: boolean
	onManageCollaborators?: () => void
}

/** 移动端详情头部只保留返回、项目名和三个主要动作，避免桌面 Tooltip 与文字按钮占满横向空间。 */
export default function MicroAppMobileHeader({
	selectedProject,
	hasEntries,
	isDatabasePanelOpen,
	onBack,
	onToggleDatabasePanel,
	onPublish,
	canManageCollaborators,
	onManageCollaborators,
}: MicroAppMobileHeaderProps) {
	const { t } = useTranslation("super")
	const projectName = selectedProject?.project_name || t("project.unnamedProject")

	return (
		<header
			className="mobile-page-header shrink-0 border-b border-border"
			data-testid="micro-app-mobile-header"
		>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-9 shrink-0"
				onClick={onBack}
				aria-label={t("microAppPage.header.backToApps")}
			>
				<ArrowLeft className="size-[18px]" aria-hidden />
			</Button>

			<p className="min-w-0 flex-1 truncate px-1 text-base font-medium text-foreground">
				{projectName}
			</p>

			<div className="flex shrink-0 items-center gap-0.5">
				<Button
					type="button"
					variant={isDatabasePanelOpen ? "secondary" : "ghost"}
					size="icon"
					className="size-9"
					onClick={onToggleDatabasePanel}
					disabled={!selectedProject?.id}
					aria-label={
						isDatabasePanelOpen
							? t("microAppPage.header.hideDatabase")
							: t("microAppPage.header.showDatabase")
					}
					data-testid="micro-app-mobile-database-button"
				>
					<Database className="size-4" aria-hidden />
				</Button>

				{canManageCollaborators && onManageCollaborators ? (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-9"
						onClick={onManageCollaborators}
						aria-label={t("project.addCollaborators")}
						data-testid="micro-app-mobile-manage-collaborators"
					>
						<UserRoundPlus className="size-4" aria-hidden />
					</Button>
				) : null}

				{hasEntries ? (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-9 text-primary"
						onClick={onPublish}
						aria-label={t("microAppPage.publish.button")}
						data-testid="micro-app-mobile-publish-button"
					>
						<Rocket className="size-4" aria-hidden />
					</Button>
				) : null}
			</div>
		</header>
	)
}
