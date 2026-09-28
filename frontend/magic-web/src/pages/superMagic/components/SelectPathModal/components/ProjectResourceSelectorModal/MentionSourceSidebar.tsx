import { Bot, Box, LayoutGrid, UsersRound, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"
import { MagiClaw } from "@/enhance/lucide-react"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { SidebarRow } from "../../../SidebarSection"
import type { Workspace } from "../../../../pages/Workspace/types"
import {
	MY_AGENTS_WORKSPACE_ID,
	MY_CLAW_WORKSPACE_ID,
	MY_SKILLS_WORKSPACE_ID,
	SHARE_WORKSPACE_ID,
} from "../../../../constants"
import { useSelectionListViewport } from "./useSelectionListViewport"

export function MentionSourceSidebar({
	workspaces,
	specialWorkspaces,
	current,
	onSelect,
}: {
	workspaces: Workspace[]
	specialWorkspaces: Workspace[]
	current: Workspace | null
	onSelect: (workspace: Workspace) => void
}) {
	const { t } = useTranslation("super")
	const viewport = useSelectionListViewport('[data-testid^="picker-source-"]', workspaces.length)
	const row = (workspace: Workspace) => {
		const Icon =
			workspace.workspace_type === "micro-app"
				? LayoutGrid
				: workspace.id === SHARE_WORKSPACE_ID
					? UsersRound
					: workspace.id === MY_CLAW_WORKSPACE_ID
						? MagiClaw
						: workspace.id === MY_SKILLS_WORKSPACE_ID
							? Wrench
							: workspace.id === MY_AGENTS_WORKSPACE_ID
								? Bot
								: Box
		return (
			<SidebarRow
				key={workspace.id}
				label={workspace.name || t("workspace.unnamedWorkspace")}
				labelVariant="navigation"
				labelClassName="text-xs"
				leading={<Icon size={16} />}
				hideChevron
				testId={`picker-source-${workspace.id}`}
				isActive={
					current?.id === workspace.id ||
					(workspace.workspace_type === "micro-app" &&
						current?.workspace_type === "micro-app")
				}
				onClick={() => onSelect(workspace)}
			/>
		)
	}
	return (
		<nav
			aria-label={t("selectPathModal.workspace")}
			className="flex min-h-0 w-40 shrink-0 flex-col border-r bg-muted/20 p-2"
		>
			<div className="shrink-0 px-2 py-2 text-xs font-medium text-muted-foreground">
				{t("selectPathModal.workspace")}
			</div>
			<div ref={viewport.containerRef} className="min-h-0 flex-1">
				<ScrollArea
					className="h-full"
					style={viewport.height ? { height: viewport.height } : undefined}
					viewportRef={viewport.viewportRef}
					viewportClassName="[&>div]:!block"
				>
					<div>{workspaces.map(row)}</div>
				</ScrollArea>
			</div>
			<div className="mt-2 shrink-0 border-t pt-2">{specialWorkspaces.map(row)}</div>
		</nav>
	)
}
