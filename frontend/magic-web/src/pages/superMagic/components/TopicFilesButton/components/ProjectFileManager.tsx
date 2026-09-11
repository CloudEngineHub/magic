import { useEffect, useMemo, useState } from "react"
import { Input as AntInput } from "antd"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/shadcn-ui/dialog"
import type { ProjectListItem, Topic } from "../../../pages/Workspace/types"
import type { AttachmentItem } from "../hooks/types"
import { buildAttachmentIndex } from "../utils/attachmentIndex"
import { getAttachmentKey, getAttachmentDisplayName } from "../utils/getAttachmentKey"
import { collectCascadeSelectionKeys } from "../utils/mobileAttachmentTreeSelection"
import { getDirectoryFileMenu } from "../utils/directory-menu"
import { FileDirectoryView } from "./FileDirectoryView"
import { useProjectDetailFilesController } from "../hooks/useProjectDetailFilesController"
import { useRename } from "../hooks/useRename"
import { useFileOperations } from "../hooks/useFileOperations"
import { useFileInfoPanel } from "../hooks/useFileInfoPanel"
import { SelectDirectoryModal } from "../../SelectPathModal"
import { UploadModal } from "../../MessageEditor/components/UploadModal"
import { DuplicateFileModal } from "./DuplicateFileModal"
import { FolderConflictModal } from "./FolderConflictModal"
import { addFileToCurrentChat } from "../../../utils/topics"
import { requestProjectAttachmentsFullRefresh } from "../../../services/attachmentsTopicSync"
import magicToast from "@/components/base/MagicToaster/utils"
import { validateFilename } from "@/utils/filename-validator"

export interface ProjectFileManagerProps {
	projectId: string
	initialDirectoryId?: string
	attachments: AttachmentItem[]
	selectedProject?: ProjectListItem | null
	selectedTopic?: Topic | null
	allowEdit?: boolean
	allowDownload?: boolean
	loading?: boolean
	onFileClick: (file: AttachmentItem) => void
}

/** 项目管理器沿用项目操作 Hook，包括画布风险确认、移动恢复、上传和删除提示。 */
export default function ProjectFileManager({
	projectId,
	initialDirectoryId,
	attachments,
	selectedProject,
	selectedTopic,
	allowEdit = false,
	allowDownload = true,
	loading,
	onFileClick,
}: ProjectFileManagerProps) {
	const { t } = useTranslation("super")
	const [directoryId, setDirectoryId] = useState(initialDirectoryId)
	const [selection, setSelection] = useState<Set<string>>(new Set())
	const [createMode, setCreateMode] = useState<"file" | "folder" | null>(null)
	const [name, setName] = useState("")
	const [creating, setCreating] = useState(false)
	const index = useMemo(() => buildAttachmentIndex(attachments), [attachments])
	const directory = directoryId ? index.getItemById(directoryId) : undefined
	const path =
		directoryId && directory ? [...index.getParentItemsById(directoryId), directory] : []
	const items = (directory?.children ?? attachments).filter((file) => !file.is_hidden)
	const refresh = () => requestProjectAttachmentsFullRefresh({ projectId })
	const controller = useProjectDetailFilesController({
		projectId,
		attachments,
		selectedProject,
		selectedTopic,
		setIsSelectMode: () => setSelection(new Set()),
		onUpdateAttachments: refresh,
		onMoveSuccess: refresh,
	})
	const rename = useRename({ projectId, attachments, onUpdateAttachments: refresh })
	const operations = useFileOperations({
		projectId,
		attachments,
		selectedProject: selectedProject ?? undefined,
		selectedTopic,
		onFileClick,
		onUpdateAttachments: refresh,
	})
	const info = useFileInfoPanel()
	useEffect(() => {
		setSelection(new Set())
	}, [controller.selectionResetKey])
	useEffect(() => {
		setDirectoryId(initialDirectoryId)
	}, [initialDirectoryId])
	const create = async () => {
		if (!createMode || creating || !name.trim()) return
		const validation = validateFilename(name, createMode === "folder", {
			t,
			allowDotStart: true,
		})
		if (!validation.isValid) {
			magicToast.error(validation.errorMessage ?? t("userSpace.invalidName"))
			return
		}
		setCreating(true)
		try {
			const parentPath = directory?.relative_file_path
			const result =
				createMode === "folder"
					? await controller.createFolder(parentPath, name)
					: await controller.createFile("md", parentPath, name.replace(/\.md$/i, ""))
			if (result) setCreateMode(null)
		} catch {
			magicToast.error(t("userSpace.operationFailed"))
		} finally {
			setCreating(false)
		}
	}
	const move = (files: AttachmentItem[]) =>
		controller.batchMoveByFileIds(files.flatMap((file) => (file.file_id ? [file.file_id] : [])))
	const remove = (files: AttachmentItem[]) => {
		void controller.batchDelete(new Set(files.flatMap(collectCascadeSelectionKeys)))
	}
	const addToChat = async (file: AttachmentItem) => {
		if (!selectedTopic) {
			magicToast.info(t("userSpace.openChatFirst"))
			return
		}
		try {
			await addFileToCurrentChat({
				fileItem: { ...file, project_id: projectId },
				autoFocus: true,
			})
		} catch {
			magicToast.error(t("common.fileNotFoundOrLoadFailed"))
		}
	}
	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<div className="shrink-0 border-b px-4 py-3 text-sm font-semibold">
				{selectedProject?.project_name ?? t("topicFiles.title")}
			</div>
			<FileDirectoryView
				compact={false}
				items={items}
				path={path.map((file) => ({
					id: getAttachmentKey(file),
					name: getAttachmentDisplayName(file),
				}))}
				rootName={t("userSpace.currentProject")}
				onNavigate={setDirectoryId}
				onOpen={onFileClick}
				selectedIds={selection}
				onSelectionChange={setSelection}
				loading={loading}
				onRetry={refresh}
				onCreate={
					allowEdit
						? (folder) => {
								setCreateMode(folder ? "folder" : "file")
								setName(
									t(folder ? "userSpace.defaultFolder" : "userSpace.defaultFile"),
								)
							}
						: undefined
				}
				onUpload={allowEdit ? controller.handleCustomUploadFile : undefined}
				onMove={allowEdit ? move : undefined}
				onDelete={allowEdit ? remove : undefined}
				onDownload={
					allowDownload
						? (files) => {
								void (async () => {
									for (const file of files)
										await operations.handleDownloadOriginal(file)
								})().catch(() => magicToast.error(t("topicFiles.downloadFailed")))
							}
						: undefined
				}
				getMenuItems={(file) =>
					getDirectoryFileMenu(
						file,
						{
							open: (item) =>
								item.is_directory
									? setDirectoryId(item.file_id)
									: onFileClick(item),
							addToChat: (item) => void addToChat(item),
							info: info.handleShowInfo,
							...(allowDownload
								? {
										download: (item: AttachmentItem) =>
											void operations.handleDownloadOriginal(item),
									}
								: {}),
							...(allowEdit
								? {
										rename: rename.handleStartRename,
										move: (item: AttachmentItem) => move([item]),
										remove: (item: AttachmentItem) => remove([item]),
									}
								: {}),
						},
						t,
					)
				}
			/>
			<Dialog
				open={Boolean(createMode)}
				onOpenChange={(open) => {
					if (!open && !creating) setCreateMode(null)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{t(
								createMode === "folder"
									? "userSpace.createFolder"
									: "userSpace.createFile",
							)}
						</DialogTitle>
					</DialogHeader>
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault()
							void create()
						}}
					>
						<Input
							autoFocus
							value={name}
							onChange={(event) => setName(event.target.value)}
							aria-label={t("userSpace.name")}
							disabled={creating}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setCreateMode(null)}
								disabled={creating}
							>
								{t("common.cancel")}
							</Button>
							<Button disabled={creating || !name.trim()} type="submit">
								{t("common.confirm")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			<Dialog
				open={Boolean(rename.renamingItemId)}
				onOpenChange={(open) => {
					if (!open) rename.handleRenameCancel()
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("userSpace.rename")}</DialogTitle>
					</DialogHeader>
					<AntInput
						ref={rename.renameInputRef}
						value={rename.renameValue}
						onChange={(event) => rename.setRenameValue(event.target.value)}
						onKeyDown={rename.handleRenameKeyDown}
					/>
					{rename.renameErrorMessage && (
						<p role="alert" className="text-sm text-destructive">
							{rename.renameErrorMessage}
						</p>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={rename.handleRenameCancel}>
							{t("common.cancel")}
						</Button>
						<Button onClick={() => void rename.handleRenameConfirm()}>
							{t("common.confirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<SelectDirectoryModal {...controller.moveSelectorProps} />
			<UploadModal
				visible={controller.uploadModalVisible}
				title={t("topicFiles.title")}
				projectId={projectId}
				uploadFiles={controller.selectedUploadFiles}
				attachments={attachments}
				defaultPath={path}
				isShowCreateDirectory
				isUploadingFolder={controller.isUploadingFolder}
				onSubmit={controller.handleUploadModalSubmit}
				onClose={controller.handleUploadModalClose}
			/>
			<DuplicateFileModal
				visible={controller.sharedDuplicateHandler.modalVisible}
				fileName={controller.sharedDuplicateHandler.currentFileName}
				totalDuplicates={controller.sharedDuplicateHandler.totalDuplicates}
				onCancel={controller.sharedDuplicateHandler.handleCancel}
				onReplace={controller.sharedDuplicateHandler.handleReplace}
				onKeepBoth={controller.sharedDuplicateHandler.handleKeepBoth}
			/>
			<FolderConflictModal
				visible={controller.sharedDuplicateHandler.folderConflictModalVisible}
				folderName={controller.sharedDuplicateHandler.currentFolderName}
				totalConflicts={controller.sharedDuplicateHandler.totalFolderConflicts}
				canMerge={controller.sharedDuplicateHandler.canMergeFolderConflict}
				onCancel={controller.sharedDuplicateHandler.handleFolderConflictCancel}
				onMerge={controller.sharedDuplicateHandler.handleFolderConflictMerge}
				onKeepBoth={controller.sharedDuplicateHandler.handleFolderConflictKeepBoth}
				onReplace={controller.sharedDuplicateHandler.handleFolderConflictReplace}
			/>
			{controller.deleteConfirmNode}
			{info.fileInfoPanel}
		</div>
	)
}
