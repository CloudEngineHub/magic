import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { CollaboratorPermission } from "@/pages/superMagic/types/collaboration"

import type { MicroAppWorkspaceView } from "./MicroAppWorkspaceNav"

const MicroAppDatabasePanel = lazy(() => import("./MicroAppDatabasePanel"))
const SiderTask = lazy(() => import("@/pages/superMagic/components/SiderTask"))
const ShareManagementPanel = lazy(
	() => import("@/pages/superMagic/components/ShareManagement/ShareManagementPanel"),
)
const LongTremMemorySider = lazy(() =>
	import("@/pages/superMagic/components/LongTremMemory/components/MemorySider").then(
		(module) => ({ default: module.LongTremMemorySider }),
	),
)

interface MicroAppProjectPanelsProps {
	activeView: MicroAppWorkspaceView
	projectId?: string
	projectRole?: CollaboratorPermission
	workspaceId?: string
	topicId?: string
}

const PROJECT_PANEL_VIEWS: MicroAppWorkspaceView[] = [
	"scheduledTasks",
	"shareManagement",
	"longMemory",
]

const PROJECT_PANEL_CLASS_NAME = cn(
	"h-full gap-0",
	"[&_[data-slot=project-panel-header]]:h-12",
	"[&_[data-slot=project-panel-header]]:border-b",
	"[&_[data-slot=project-panel-header]]:border-border",
	"[&_[data-slot=project-panel-header]]:px-4",
	"[&_[data-slot=project-panel-header]]:py-0",
	"[&_[data-slot=project-panel-title]]:block",
	"[&_[data-slot=project-panel-title]]:text-base",
	"[&_[data-slot=project-panel-title]]:font-semibold",
	"[&_[data-slot=project-panel-title]]:leading-6",
	"[&_[data-slot=project-panel-tabs]]:ml-auto",
	"[&_[data-slot=project-panel-tabs]]:mr-2",
	"[&_[data-slot=project-panel-toolbar]]:h-12",
	"[&_[data-slot=project-panel-toolbar]]:border-b",
	"[&_[data-slot=project-panel-toolbar]]:border-border",
	"[&_[data-slot=project-panel-toolbar]]:px-4",
	"[&_[data-slot=project-panel-toolbar]]:py-2",
	"[&_[data-slot=project-panel-content]]:px-0",
	"[&_[data-slot=project-panel-content]]:pb-0",
	"[&_[data-slot=project-panel-empty]]:rounded-none",
	"[&_[data-slot=project-panel-empty]]:border-0",
	"[&_[data-layout=share-management-content]>div]:gap-0",
	"[&_[data-layout=share-management-content]>div]:p-0",
)

function PanelLoading() {
	return (
		<div
			className="flex h-full items-center justify-center"
			data-testid="micro-app-panel-loading"
		>
			<Loader2 className="size-6 animate-spin text-muted-foreground" />
		</div>
	)
}

export default function MicroAppProjectPanels({
	activeView,
	projectId,
	projectRole,
	workspaceId,
	topicId,
}: MicroAppProjectPanelsProps) {
	const isProjectPanelActive = PROJECT_PANEL_VIEWS.includes(activeView)

	return (
		<>
			<div
				className={cn(
					"absolute inset-0 overflow-hidden",
					activeView !== "database" && "hidden",
				)}
				aria-hidden={activeView !== "database"}
				data-testid="micro-app-database-workspace"
			>
				<Suspense fallback={<PanelLoading />}>
					<MicroAppDatabasePanel
						active={activeView === "database"}
						projectId={projectId}
						projectRole={projectRole}
					/>
				</Suspense>
			</div>

			{isProjectPanelActive ? (
				<div
					className="absolute inset-0 overflow-hidden bg-background"
					data-testid="micro-app-project-panel-workspace"
				>
					<Suspense fallback={<PanelLoading />}>
						{activeView === "scheduledTasks" ? (
							<SiderTask
								className={PROJECT_PANEL_CLASS_NAME}
								selectWorkspaceId={workspaceId}
								selectProjectId={projectId}
								selectTopicId={topicId}
							/>
						) : null}
						{activeView === "shareManagement" ? (
							<ShareManagementPanel
								className={PROJECT_PANEL_CLASS_NAME}
								projectId={projectId}
							/>
						) : null}
						{activeView === "longMemory" ? (
							<LongTremMemorySider
								className={PROJECT_PANEL_CLASS_NAME}
								projectId={projectId}
							/>
						) : null}
					</Suspense>
				</div>
			) : null}
		</>
	)
}
