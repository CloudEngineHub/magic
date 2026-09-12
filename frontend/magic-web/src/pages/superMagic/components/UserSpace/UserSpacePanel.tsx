import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { Brain, CircleHelp, Files, FolderTree } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/shadcn-ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { cn } from "@/utils/cn"
import userFilesStore from "@/stores/userFiles"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import type { UserSpaceView } from "../Detail/components/FilesViewer/types"
import UserSpaceFilesView from "./UserSpaceFilesView"
import UserSpaceIcon from "./UserSpaceIcon"

const UserSpaceMemoryView = lazy(() => import("./UserSpaceMemoryView"))
const UserSpaceHelpDialog = lazy(() => import("./UserSpaceHelpDialog"))

export interface UserSpacePanelProps {
	className?: string
	projectId?: string | null
	projectName?: string
	topicId?: string
	activeFileId?: string | null
	onFileClick?: (file: AttachmentItem) => void
}

export default observer(function UserSpacePanel({
	className,
	projectId,
	projectName,
	topicId,
	activeFileId,
	onFileClick,
}: UserSpacePanelProps) {
	const { t } = useTranslation("super")
	const identity = userFilesStore.currentIdentityKey
	const previousIdentity = useRef(identity)
	const [view, setView] = useState<UserSpaceView>("files")
	const [memoryVisited, setMemoryVisited] = useState(false)
	const [helpVisited, setHelpVisited] = useState(false)
	const [directoryId, setDirectoryId] = useState<string>()
	useEffect(() => {
		if (previousIdentity.current === identity) return
		previousIdentity.current = identity
		setDirectoryId(undefined)
		setView("files")
	}, [identity])
	return (
		<div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
			<div
				className="flex h-9 shrink-0 items-center gap-2 px-3"
				data-slot="project-panel-header"
			>
				<UserSpaceIcon size={16} />
				<h2 className="truncate text-sm font-semibold" data-slot="project-panel-title">
					{t("userSpace.title")}
				</h2>
				<Dialog onOpenChange={(open) => open && setHelpVisited(true)}>
					<Tooltip>
						<TooltipTrigger asChild>
							<DialogTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="ml-auto size-6 shrink-0 text-muted-foreground"
									aria-label={t("userSpace.help.title")}
								>
									<CircleHelp size={16} />
								</Button>
							</DialogTrigger>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="max-w-72">
							{t("userSpace.help.tooltip")}
						</TooltipContent>
					</Tooltip>
					{helpVisited && (
						<Suspense
							fallback={
								<DialogContent>
									<DialogTitle>{t("userSpace.help.title")}</DialogTitle>
									<p>{t("userSpace.loading")}</p>
								</DialogContent>
							}
						>
							<UserSpaceHelpDialog />
						</Suspense>
					)}
				</Dialog>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 shrink-0"
					aria-label={t("userSpace.openManager")}
					title={t("userSpace.openManager")}
					onClick={() =>
						onFileClick?.({
							file_manager: {
								spaceType: "user",
								view,
								directoryId: view === "files" ? directoryId : undefined,
								projectId: projectId ?? undefined,
								projectName,
								topicId,
							},
						})
					}
				>
					<FolderTree size={16} />
				</Button>
			</div>
			<div role="tablist" className="mx-2 flex shrink-0 rounded-md bg-muted p-0.5">
				{(
					[
						{ key: "files", title: t("userSpace.allFiles"), Icon: Files },
						{ key: "memory", title: t("userSpace.memory"), Icon: Brain },
					] as const
				).map(({ key, title, Icon }) => (
					<button
						key={key}
						role="tab"
						aria-selected={view === key}
						className={cn(
							"flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs",
							view === key ? "bg-background shadow-sm" : "text-muted-foreground",
						)}
						onClick={() => {
							setView(key)
							if (key === "memory") setMemoryVisited(true)
						}}
					>
						<Icon size={14} />
						{title}
					</button>
				))}
			</div>
			<div className={cn("min-h-0 flex-1", view !== "files" && "hidden")} role="tabpanel">
				<UserSpaceFilesView
					active={view === "files"}
					directoryId={directoryId}
					onDirectoryChange={setDirectoryId}
					onFileClick={onFileClick}
					topicId={topicId}
					activeFileId={activeFileId}
				/>
			</div>
			{memoryVisited && (
				<div
					className={cn("min-h-0 flex-1", view !== "memory" && "hidden")}
					role="tabpanel"
				>
					<Suspense
						fallback={
							<p className="p-3 text-xs text-muted-foreground">
								{t("userSpace.loading")}
							</p>
						}
					>
						<UserSpaceMemoryView
							projectId={projectId}
							projectName={projectName}
							topicId={topicId}
							activeFileId={activeFileId}
							onFileClick={onFileClick}
						/>
					</Suspense>
				</div>
			)}
		</div>
	)
})
