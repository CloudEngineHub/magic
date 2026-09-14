import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import type { FileManagerContext } from "../Detail/components/FilesViewer/types"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import UserSpaceFilesView from "./UserSpaceFilesView"
import UserSpaceMemoryManager from "./UserSpaceMemoryManager"

export default function UserSpaceFileManager({
	context,
	onFileClick,
	projectId,
	projectName,
	topicId,
	isActive = true,
}: {
	context: Extract<FileManagerContext, { spaceType: "user" }>
	onFileClick: (file: AttachmentItem) => void
	projectId?: string
	projectName?: string
	topicId?: string
	isActive?: boolean
}) {
	const { t } = useTranslation("super")
	const [view, setView] = useState(context.view)
	const [directoryId, setDirectoryId] = useState(context.directoryId)
	useEffect(() => {
		setView(context.view)
		setDirectoryId(context.directoryId)
	}, [context])
	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<div
				className="flex shrink-0 gap-1 border-b px-3 py-1"
				role="tablist"
				aria-label={t("userSpace.title")}
			>
				<Button
					role="tab"
					aria-selected={view === "files"}
					variant={view === "files" ? "secondary" : "ghost"}
					size="sm"
					onClick={() => setView("files")}
				>
					{t("userSpace.allFiles")}
				</Button>
				<Button
					role="tab"
					aria-selected={view === "memory"}
					variant={view === "memory" ? "secondary" : "ghost"}
					size="sm"
					onClick={() => setView("memory")}
				>
					{t("userSpace.memory")}
				</Button>
			</div>
			{view === "memory" ? (
				<UserSpaceMemoryManager
					active={isActive}
					projectId={projectId}
					projectName={projectName}
					topicId={topicId}
					onFileClick={onFileClick}
				/>
			) : (
				<UserSpaceFilesView
					compact={false}
					active={isActive}
					directoryId={directoryId}
					onDirectoryChange={setDirectoryId}
					topicId={topicId}
					onFileClick={onFileClick}
				/>
			)}
		</div>
	)
}
