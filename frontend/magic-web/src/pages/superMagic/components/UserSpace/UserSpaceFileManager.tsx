import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { FileManagerContext } from "../Detail/components/FilesViewer/types"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import UserSpaceFilesView from "./UserSpaceFilesView"
import UserSpaceMemoryView from "./UserSpaceMemoryView"

export default function UserSpaceFileManager({
	context,
	onFileClick,
	projectId,
	projectName,
	topicId,
}: {
	context: Extract<FileManagerContext, { spaceType: "user" }>
	onFileClick: (file: AttachmentItem) => void
	projectId?: string
	projectName?: string
	topicId?: string
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
			<div className="shrink-0 border-b px-4 py-3 text-sm font-semibold">
				{t("userSpace.title")} /{" "}
				{t(view === "memory" ? "userSpace.memory" : "userSpace.allFiles")}
			</div>
			{view === "memory" ? (
				<UserSpaceMemoryView
					compact={false}
					projectId={projectId}
					projectName={projectName}
					topicId={topicId}
					onFileClick={onFileClick}
				/>
			) : (
				<UserSpaceFilesView
					compact={false}
					directoryId={directoryId}
					onDirectoryChange={setDirectoryId}
					topicId={topicId}
					onFileClick={onFileClick}
				/>
			)}
		</div>
	)
}
