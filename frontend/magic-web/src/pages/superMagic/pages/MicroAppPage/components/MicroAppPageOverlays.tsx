import type { ReactNode } from "react"
import type { UpdateMicroAppBody } from "@/apis/modules/superMagic"

import MicroAppPublishDialog from "./MicroAppPublishDialog"
import MicroAppEditDialog from "./MicroAppEditDialog"

interface MicroAppPageOverlaysProps {
	appId?: string
	projectName?: string
	publishDialogOpen: boolean
	onPublishDialogOpenChange: (open: boolean) => void
	onPublishStatusChange: (published: boolean) => void
	onProjectNameChange: (projectName: string) => void
	editDialogOpen: boolean
	editSubmitting: boolean
	onEditDialogOpenChange: (open: boolean) => void
	onEditMicroApp: (changes: UpdateMicroAppBody) => Promise<boolean>
	onCaptureCover?: () => Promise<Blob>
	collaboratorPanel: ReactNode
}

/** 桌面端与移动端共享发布、数据库和协作者浮层，避免两套页面重复维护行为。 */
export default function MicroAppPageOverlays({
	appId,
	projectName,
	publishDialogOpen,
	onPublishDialogOpenChange,
	onPublishStatusChange,
	onProjectNameChange,
	editDialogOpen,
	editSubmitting,
	onEditDialogOpenChange,
	onEditMicroApp,
	onCaptureCover,
	collaboratorPanel,
}: MicroAppPageOverlaysProps) {
	return (
		<>
			<MicroAppPublishDialog
				open={publishDialogOpen}
				appId={appId}
				projectName={projectName}
				onProjectNameChange={onProjectNameChange}
				onPublishStatusChange={onPublishStatusChange}
				onOpenChange={onPublishDialogOpenChange}
			/>
			<MicroAppEditDialog
				open={editDialogOpen}
				appId={appId}
				projectName={projectName}
				isSubmitting={editSubmitting}
				onOpenChange={onEditDialogOpenChange}
				onConfirm={onEditMicroApp}
				onCaptureCover={onCaptureCover}
			/>
			{collaboratorPanel}
		</>
	)
}
