import { memo } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { MemoryFileTreePanel } from "../MemoryFileTreePanel"

interface LongTremMemorySiderProps {
	projectId?: string | null
	selectedProject?: ProjectListItem | null
	selectedWorkspace?: Workspace | null
	activeFileId?: string | null
	onFileClick?: (fileItem: AttachmentItem) => void
	showHeader?: boolean
	className?: string
}

/** 项目侧长期记忆入口，复用项目文件交互并保持独立数据状态。 */
export const LongTremMemorySider = memo(function LongTremMemorySider({
	projectId,
	selectedProject,
	selectedWorkspace,
	activeFileId,
	onFileClick,
	showHeader = false,
	className,
}: LongTremMemorySiderProps) {
	const { t } = useTranslation("super/longMemory")

	return (
		<div
			className={cn("flex h-full min-h-0 flex-col", className)}
			data-testid="long-memory-sider-panel"
		>
			{showHeader ? (
				<div
					className="flex h-8 shrink-0 items-center px-2"
					data-slot="project-panel-header"
				>
					<span
						className="text-sm font-semibold text-foreground"
						data-slot="project-panel-title"
					>
						{t("longMemory")}
					</span>
				</div>
			) : null}
			<div className="min-h-0 flex-1">
				<MemoryFileTreePanel
					projectId={projectId}
					selectedProject={selectedProject}
					selectedWorkspace={selectedWorkspace}
					activeFileId={activeFileId}
					onFileClick={onFileClick}
					showTitle={!showHeader}
				/>
			</div>
		</div>
	)
})
