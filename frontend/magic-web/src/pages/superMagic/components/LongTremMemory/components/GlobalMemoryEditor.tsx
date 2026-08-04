import { FileText, Pencil, RefreshCw, Save, X } from "lucide-react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import EditorBody from "@/pages/superMagic/components/Detail/contents/Md/components/EditorBody"
import type { MagicFSFile } from "@/apis"
import {
	MemoryFileConcurrentModificationError,
	memoryFileService,
	type MemoryFileSnapshot,
} from "../services/memoryFileService"
import { mergeMemoryContent } from "../services/memoryThreeWayMerge"
import { MemoryEditConflictDialog } from "./MemoryEditConflictDialog"

type GlobalMemoryLoadState = "loading" | "ready" | "empty" | "error"

/** 编辑期间检测到的服务器最新快照。 */
interface MemoryConflictState {
	latestSnapshot: MemoryFileSnapshot
}

/** 个人中心全局长期记忆单文件编辑器。 */
export const GlobalMemoryEditor = memo(function GlobalMemoryEditor() {
	const { t } = useTranslation("super/longMemory")
	const requestIdRef = useRef(0)
	const [loadState, setLoadState] = useState<GlobalMemoryLoadState>("loading")
	const [memoryFile, setMemoryFile] = useState<MagicFSFile | null>(null)
	const [content, setContent] = useState("")
	const [draft, setDraft] = useState("")
	const [baseContent, setBaseContent] = useState("")
	const [baseRevision, setBaseRevision] = useState<number | null>(null)
	const [isEditing, setIsEditing] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const [enteringEdit, setEnteringEdit] = useState(false)
	const [saving, setSaving] = useState(false)
	const [conflictState, setConflictState] = useState<MemoryConflictState | null>(null)

	/** 加载固定路径 global/MEMORY.md 的最新内容。 */
	const loadGlobalMemory = useCallback(async () => {
		const requestId = ++requestIdRef.current
		setLoadState("loading")
		setIsEditing(false)
		setConflictState(null)

		try {
			const file = await memoryFileService.findGlobalMemoryFile()
			if (requestId !== requestIdRef.current) return
			if (!file) {
				setMemoryFile(null)
				setContent("")
				setDraft("")
				setBaseContent("")
				setBaseRevision(null)
				setLoadState("empty")
				return
			}

			const snapshot = await memoryFileService.readStableSnapshot(file.id)
			if (requestId !== requestIdRef.current) return
			setMemoryFile(snapshot.file)
			setContent(snapshot.content)
			setDraft(snapshot.content)
			setBaseContent(snapshot.content)
			setBaseRevision(snapshot.revision)
			setLoadState("ready")
		} catch (error) {
			if (requestId !== requestIdRef.current) return
			console.error("加载全局长期记忆失败", error)
			setLoadState("error")
		}
	}, [])

	useEffect(() => {
		void loadGlobalMemory()
		return () => {
			requestIdRef.current += 1
		}
	}, [loadGlobalMemory])

	/** 拉取冲突发生后的服务器最新稳定快照。 */
	const loadConflictSnapshot = useCallback(async (fileId: string) => {
		const latestSnapshot = await memoryFileService.readStableSnapshot(fileId)
		setConflictState({ latestSnapshot })
	}, [])

	/** 使用指定编辑基准保存当前草稿。 */
	const saveGlobalMemory = useCallback(
		async (expectedRevision: number | null = baseRevision) => {
			if (!memoryFile || expectedRevision === null) return

			setSaving(true)
			try {
				const result = await memoryFileService.saveFileContent(
					memoryFile.id,
					draft,
					expectedRevision,
				)
				setMemoryFile((current) =>
					current
						? {
								...current,
								version: result.revision,
							}
						: current,
				)
				setContent(draft)
				setBaseContent(draft)
				setBaseRevision(result.revision)
				setConflictState(null)
				setIsEditing(false)
				magicToast.success(t("globalEditor.saveSuccess"))
			} catch (error) {
				console.error("保存全局长期记忆失败", error)
				if (error instanceof MemoryFileConcurrentModificationError) {
					try {
						await loadConflictSnapshot(memoryFile.id)
					} catch (snapshotError) {
						console.error("加载冲突后的最新长期记忆失败", snapshotError)
						magicToast.error(t("globalEditor.editLoadFailed"))
					}
				} else {
					magicToast.error(t("globalEditor.saveFailed"))
				}
			} finally {
				setSaving(false)
			}
		},
		[baseRevision, draft, loadConflictSnapshot, memoryFile, t],
	)

	/** 取消编辑并恢复最后一次成功加载或保存的内容。 */
	const cancelEditing = useCallback(() => {
		setDraft(content)
		setConflictState(null)
		setIsEditing(false)
	}, [content])

	/** 拉取最新稳定快照后进入 Markdown 源码编辑模式。 */
	const startEditing = useCallback(async () => {
		if (!memoryFile) return

		setEnteringEdit(true)
		try {
			const snapshot = await memoryFileService.readStableSnapshot(memoryFile.id)
			setMemoryFile(snapshot.file)
			setContent(snapshot.content)
			setDraft(snapshot.content)
			setBaseContent(snapshot.content)
			setBaseRevision(snapshot.revision)
			setConflictState(null)
			setIsEditing(true)
		} catch (error) {
			console.error("进入编辑前加载最新长期记忆失败", error)
			magicToast.error(t("globalEditor.editLoadFailed"))
		} finally {
			setEnteringEdit(false)
		}
	}, [memoryFile, t])

	/** 主动获取并展示服务器上的最新长期记忆内容。 */
	const refreshLatestContent = useCallback(async () => {
		if (!memoryFile) return

		setRefreshing(true)
		try {
			const snapshot = await memoryFileService.readStableSnapshot(memoryFile.id)
			setMemoryFile(snapshot.file)
			setContent(snapshot.content)
			setDraft(snapshot.content)
			setBaseContent(snapshot.content)
			setBaseRevision(snapshot.revision)
			setConflictState(null)
			magicToast.success(t("globalEditor.refreshSuccess"))
		} catch (error) {
			console.error("更新全局长期记忆失败", error)
			magicToast.error(t("globalEditor.refreshFailed"))
		} finally {
			setRefreshing(false)
		}
	}, [memoryFile, t])

	/** 放弃本地草稿并切换到服务器最新内容。 */
	const useLatestContent = useCallback(() => {
		if (!conflictState) return

		const { latestSnapshot } = conflictState
		setMemoryFile(latestSnapshot.file)
		setContent(latestSnapshot.content)
		setDraft(latestSnapshot.content)
		setBaseContent(latestSnapshot.content)
		setBaseRevision(latestSnapshot.revision)
		setConflictState(null)
		setIsEditing(false)
	}, [conflictState])

	/** 将本地草稿与服务器最新内容进行三方合并后继续编辑。 */
	const mergeLatestContent = useCallback(() => {
		if (!conflictState) return

		const { latestSnapshot } = conflictState
		const mergeResult = mergeMemoryContent(baseContent, draft, latestSnapshot.content, {
			local: t("globalEditor.conflict.localLabel"),
			remote: t("globalEditor.conflict.remoteLabel"),
		})

		setMemoryFile(latestSnapshot.file)
		setContent(latestSnapshot.content)
		setBaseContent(latestSnapshot.content)
		setBaseRevision(latestSnapshot.revision)
		setDraft(mergeResult.content)
		setConflictState(null)
		setIsEditing(true)
		magicToast.info(
			t(
				mergeResult.hasConflicts
					? "globalEditor.conflict.mergeHasConflicts"
					: "globalEditor.conflict.mergeReady",
			),
		)
	}, [baseContent, conflictState, draft, t])

	/** 以刚获取的服务器最新修订号重试覆盖保存。 */
	const overwriteLatestContent = useCallback(() => {
		if (!conflictState) return
		void saveGlobalMemory(conflictState.latestSnapshot.revision)
	}, [conflictState, saveGlobalMemory])

	if (loadState === "loading") {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
				<RefreshCw className="mr-2 size-4 animate-spin" />
				{t("loading")}
			</div>
		)
	}

	if (loadState === "empty") {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
				<FileText className="size-10 text-muted-foreground" />
				<div className="text-base font-medium">{t("globalEditor.emptyTitle")}</div>
				<div className="max-w-md text-sm text-muted-foreground">
					{t("globalEditor.emptyDescription")}
				</div>
				<Button variant="outline" size="sm" onClick={() => void loadGlobalMemory()}>
					<RefreshCw size={16} />
					{t("fileTree.refresh")}
				</Button>
			</div>
		)
	}

	if (loadState === "error") {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
				<div className="text-sm text-muted-foreground">{t("globalEditor.loadFailed")}</div>
				<Button variant="outline" size="sm" onClick={() => void loadGlobalMemory()}>
					{t("fileTree.retry")}
				</Button>
			</div>
		)
	}

	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col border-t border-border">
				<div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
					<div className="min-w-0">
						<div className="truncate text-sm font-medium">
							~/.magic/memory/global/MEMORY.md
						</div>
						<div className="text-xs text-muted-foreground">
							{t("globalEditor.pathDescription")}
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{isEditing ? (
							<>
								<Button
									variant="outline"
									size="sm"
									disabled={saving}
									onClick={cancelEditing}
								>
									<X size={16} />
									{t("cancel")}
								</Button>
								<Button
									size="sm"
									disabled={saving}
									onClick={() => void saveGlobalMemory()}
								>
									<Save size={16} />
									{t("globalEditor.save")}
								</Button>
							</>
						) : (
							<>
								<Button
									variant="outline"
									size="sm"
									disabled={refreshing || enteringEdit}
									onClick={() => void refreshLatestContent()}
								>
									<RefreshCw
										className={refreshing ? "animate-spin" : undefined}
										size={16}
									/>
									{t("globalEditor.refresh")}
								</Button>
								<Button
									size="sm"
									disabled={enteringEdit || refreshing}
									onClick={() => void startEditing()}
								>
									{enteringEdit ? (
										<RefreshCw className="animate-spin" size={16} />
									) : (
										<Pencil size={16} />
									)}
									{t("edit")}
								</Button>
							</>
						)}
					</div>
				</div>
				<div className="min-h-0 flex-1 overflow-hidden">
					<EditorBody
						isLoading={false}
						viewMode={isEditing ? "code" : "markdown"}
						language="markdown"
						content={content}
						processedContent={content}
						className={
							isEditing
								? "h-full min-h-0 overflow-hidden"
								: "h-full overflow-auto p-5"
						}
						isEditMode={isEditing}
						editContent={draft}
						setEditContent={setDraft}
						onSave={() => void saveGlobalMemory()}
						placeholder={t("globalEditor.placeholder")}
						data-testid="global-memory-editor"
					/>
				</div>
			</div>
			<MemoryEditConflictDialog
				open={Boolean(conflictState)}
				loading={saving}
				onCancel={() => setConflictState(null)}
				onUseLatest={useLatestContent}
				onMerge={mergeLatestContent}
				onOverwrite={overwriteLatestContent}
			/>
		</>
	)
})
