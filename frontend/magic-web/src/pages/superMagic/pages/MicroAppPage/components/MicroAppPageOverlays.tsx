import type { ReactNode } from "react"

import MicroAppPublishDialog from "./MicroAppPublishDialog"
import MicroAppRenameDialog from "./MicroAppRenameDialog"

interface MicroAppPageOverlaysProps {
	appId?: string
	projectName?: string
	publishDialogOpen: boolean
	onPublishDialogOpenChange: (open: boolean) => void
	onProjectNameChange: (projectName: string) => void
	renameDialogOpen: boolean
	renameSubmitting: boolean
	onRenameDialogOpenChange: (open: boolean) => void
	onRenameProject: (projectName: string) => Promise<boolean>
	collaboratorPanel: ReactNode
}

/** 桌面端与移动端共享发布、数据库和协作者浮层，避免两套页面重复维护行为。 */
export default function MicroAppPageOverlays({
	appId,
	projectName,
	publishDialogOpen,
	onPublishDialogOpenChange,
	onProjectNameChange,
	renameDialogOpen,
	renameSubmitting,
	onRenameDialogOpenChange,
	onRenameProject,
	collaboratorPanel,
}: MicroAppPageOverlaysProps) {
	return (
		<>
			<MicroAppPublishDialog
				open={publishDialogOpen}
				appId={appId}
				projectName={projectName}
				onProjectNameChange={onProjectNameChange}
				onOpenChange={onPublishDialogOpenChange}
			/>
			<MicroAppRenameDialog
				open={renameDialogOpen}
				projectName={projectName}
				isSubmitting={renameSubmitting}
				onOpenChange={onRenameDialogOpenChange}
				onConfirm={onRenameProject}
			/>
			{collaboratorPanel}
		</>
	)
}
