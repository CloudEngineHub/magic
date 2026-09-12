import { useEffect, useMemo, useState, useRef } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, FilePlus2 } from "lucide-react"
import type { MagicFSFile } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import magicToast from "@/components/base/MagicToaster/utils"
import userFilesStore from "@/stores/userFiles"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import {
	getUserMemoryPath,
	USER_MEMORY_ROOT,
	USER_MEMORY_ENTRY,
	USER_MEMORY_NOTES,
} from "../LongTremMemory/components/memoryTreeNodeUtils"
import { toUserAttachment, userSpaceFileService } from "./services/userSpaceFileService"
import UserSpaceFilesView from "./UserSpaceFilesView"

interface MemoryGroupProps {
	projectId?: string | null
	projectName?: string
	onFileClick?: (file: AttachmentItem) => void
	onLocate: (id?: string) => void
	activeFileId?: string | null
	topicId?: string | null
	compact?: boolean
	scrollElementRef?: React.RefObject<HTMLElement>
}
const MemoryGroup = observer(function MemoryGroup({
	projectId,
	projectName,
	onFileClick,
	onLocate,
	activeFileId,
	topicId,
	compact = true,
	scrollElementRef,
}: MemoryGroupProps) {
	const { t } = useTranslation("super")
	const identity = userFilesStore.currentIdentityKey
	const mutationVersion = userFilesStore.mutationVersion
	const [rootSnapshot, setRootSnapshot] = useState<{
		identity: string | null
		file: MagicFSFile | null
	}>()
	const root = rootSnapshot?.identity === identity ? rootSnapshot.file : null
	const setRoot = (file: MagicFSFile | null) => setRootSnapshot({ identity, file })
	const [directoryId, setDirectoryId] = useState<string>()
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [creating, setCreating] = useState(false)
	const [retry, setRetry] = useState(0)
	const segments = useMemo(() => getUserMemoryPath(projectId), [projectId])
	const scopePath = segments.join("/")
	useEffect(() => {
		setRoot(null)
		setDirectoryId(undefined)
		setLoading(true)
	}, [identity, scopePath])
	useEffect(() => {
		let cancelled = false
		void userFilesStore
			.findPath(segments)
			.then(async (file) => {
				if (file) await userFilesStore.loadDirectory(file.id)
				if (!cancelled) {
					setRoot(file)
					setError(false)
				}
			})
			.catch(() => {
				if (!cancelled) setError(true)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [identity, segments, mutationVersion, retry])
	const entryExists =
		root &&
		userFilesStore
			.getChildren(root.id)
			.some((file) => file.name === USER_MEMORY_ENTRY && !file.is_directory)
	const destination = () => userFilesStore.ensureDirectory([...segments, USER_MEMORY_NOTES])
	const createEntry = async () => {
		if (creating) return
		setCreating(true)
		try {
			const directory = await userFilesStore.ensureDirectory(segments)
			if (identity !== userFilesStore.currentIdentityKey) return
			const children = await userFilesStore.loadDirectory(directory.id, true)
			if (identity !== userFilesStore.currentIdentityKey) return
			let file = children.find(
				(item) => item.name === USER_MEMORY_ENTRY && !item.is_directory,
			)
			if (!file) {
				try {
					file = await userSpaceFileService.createNode({
						name: USER_MEMORY_ENTRY,
						parentId: directory.id,
						isDirectory: false,
					})
				} catch (error) {
					if (identity !== userFilesStore.currentIdentityKey) return
					file = (await userFilesStore.loadDirectory(directory.id, true)).find(
						(item) => item.name === USER_MEMORY_ENTRY && !item.is_directory,
					)
					if (!file) throw error
				}
			}
			if (identity !== userFilesStore.currentIdentityKey) return
			userFilesStore.notifyMutation()
			await userFilesStore.loadDirectory(directory.id, true)
			if (identity === userFilesStore.currentIdentityKey)
				onFileClick?.(toUserAttachment(file, `${scopePath}/${USER_MEMORY_ENTRY}`))
		} catch {
			if (identity === userFilesStore.currentIdentityKey)
				magicToast.error(t("userSpace.operationFailed"))
		} finally {
			setCreating(false)
		}
	}
	const title = projectId ? t("userSpace.projectMemory") : t("userSpace.globalMemory")
	const locateAction = (
		<Button
			variant="ghost"
			size="icon"
			className="size-6 shrink-0"
			aria-label={t("userSpace.locateAllFiles")}
			onClick={() => onLocate(directoryId ?? root?.id)}
		>
			<ArrowUpRight size={16} />
		</Button>
	)
	return (
		<section className="flex min-h-0 shrink-0 flex-col border-b last:border-0">
			{projectId && projectName && (
				<p className="truncate px-4 pt-2 text-xs text-muted-foreground">{projectName}</p>
			)}
			{!root && (
				<div className="flex shrink-0 items-center justify-between px-4 py-2 text-sm font-semibold">
					{title}
					{locateAction}
				</div>
			)}
			{loading ? (
				<p className="p-3 text-xs text-muted-foreground">{t("userSpace.loading")}</p>
			) : error ? (
				<Button variant="ghost" onClick={() => setRetry((value) => value + 1)}>
					{t("userSpace.retry")}
				</Button>
			) : (
				<>
					{!entryExists && (
						<div className="flex shrink-0 items-center justify-between px-4 py-2 text-xs text-muted-foreground">
							<span>{t("userSpace.noMemory")}</span>
							<Button
								variant="ghost"
								size="sm"
								disabled={creating}
								onClick={() => void createEntry()}
							>
								<FilePlus2 size={16} />
								{t("userSpace.createMemory")}
							</Button>
						</div>
					)}
					{root && (
						<UserSpaceFilesView
							rootId={root.id}
							rootName={title}
							resolveParent={destination}
							directoryId={directoryId}
							onDirectoryChange={setDirectoryId}
							onFileClick={onFileClick}
							activeFileId={activeFileId}
							topicId={topicId}
							compact={compact}
							scrollElementRef={scrollElementRef}
							headerTrailingAction={locateAction}
						/>
					)}
				</>
			)}
		</section>
	)
})
export default function UserSpaceMemoryView(props: MemoryGroupProps) {
	const scrollElementRef = useRef<HTMLDivElement>(null)
	const { t } = useTranslation("super")
	const locateOtherProjects = async () => {
		const identity = userFilesStore.currentIdentityKey
		try {
			const directory = await userFilesStore.findPath([...USER_MEMORY_ROOT, "projects"])
			if (identity === userFilesStore.currentIdentityKey) props.onLocate(directory?.id)
		} catch {
			if (identity === userFilesStore.currentIdentityKey)
				magicToast.error(t("userSpace.loadFailed"))
		}
	}
	return (
		<div ref={scrollElementRef} className="h-full min-h-0 overflow-auto">
			<div className="flex flex-col">
				<MemoryGroup {...props} scrollElementRef={scrollElementRef} projectId={undefined} />
				{props.projectId ? (
					<MemoryGroup
						key={props.projectId}
						{...props}
						scrollElementRef={scrollElementRef}
					/>
				) : (
					<div className="p-4 text-xs text-muted-foreground">
						{t("userSpace.enterProject")}
					</div>
				)}
				<Button
					variant="ghost"
					size="sm"
					className="shrink-0"
					onClick={() => void locateOtherProjects()}
				>
					{t("userSpace.otherProjectMemories")}
				</Button>
			</div>
		</div>
	)
}
