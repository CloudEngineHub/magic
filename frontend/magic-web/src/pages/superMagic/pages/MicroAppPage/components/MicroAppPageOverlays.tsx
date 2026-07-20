import type { ReactNode } from "react"

import MicroAppPublishDialog from "./MicroAppPublishDialog"

interface MicroAppPageOverlaysProps {
	projectId?: string
	projectName?: string
	publishDialogOpen: boolean
	onPublishDialogOpenChange: (open: boolean) => void
	onProjectNameChange: (projectName: string) => void
	collaboratorPanel: ReactNode
}

/** 桌面端与移动端共享发布、数据库和协作者浮层，避免两套页面重复维护行为。 */
export default function MicroAppPageOverlays({
	projectId,
	projectName,
	publishDialogOpen,
	onPublishDialogOpenChange,
	onProjectNameChange,
	collaboratorPanel,
}: MicroAppPageOverlaysProps) {
	return (
		<>
			<MicroAppPublishDialog
				open={publishDialogOpen}
				projectId={projectId}
				projectName={projectName}
				onProjectNameChange={onProjectNameChange}
				onOpenChange={onPublishDialogOpenChange}
			/>
			{collaboratorPanel}
		</>
	)
}
