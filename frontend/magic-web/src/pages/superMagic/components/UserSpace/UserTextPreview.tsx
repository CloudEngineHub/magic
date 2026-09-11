import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { Button } from "@/components/shadcn-ui/button"
import magicToast from "@/components/base/MagicToaster/utils"
import CommonHeaderV2 from "../Detail/components/CommonHeaderV2"
import type { CommonHeaderV2Props } from "../Detail/components/CommonHeaderV2/types"
import FileEditButtons from "../Detail/components/EditToolbar/FileEditButtons"
import EditorBody from "../Detail/contents/Md/components/EditorBody"
import { DetailType } from "../Detail/types"
import type { FileItem } from "../Detail/components/FilesViewer/types"
import useSaveHandlerRegistration from "../Detail/hooks/useSaveHandlerRegistration"
import { MemoryEditConflictDialog } from "../LongTremMemory/components/MemoryEditConflictDialog"
import { getFileReferenceIdentityKey } from "../../services/userFileReferenceResolver"
import { userSpaceFileService } from "./services/userSpaceFileService"
import { useUserFileEditor } from "./hooks/useUserFileEditor"

interface UserTextPreviewProps extends Omit<CommonHeaderV2Props, "isEditMode"> {
	data: FileItem
	isEditMode: boolean
	setIsEditMode: (value: boolean) => void
	onRegisterSaveHandler?: (handler: (() => Promise<void>) | null) => void
	isTabActive?: boolean
	showFileHeader?: boolean
}

export default observer(function UserTextPreview({
	data,
	isEditMode,
	setIsEditMode,
	onRegisterSaveHandler,
	isTabActive = true,
	showFileHeader = true,
	...headerProps
}: UserTextPreviewProps) {
	const { t } = useTranslation("super")
	const identityKey = getFileReferenceIdentityKey()
	const editor = useUserFileEditor(data.file_id, isEditMode, identityKey)
	const save = useMemoizedFn(async () => {
		await editor.save()
	})
	useSaveHandlerRegistration({ isEditMode, handleSave: save, onRegisterSaveHandler })
	const saveFromButton = async (exit = false) => {
		try {
			await save()
			if (exit) setIsEditMode(false)
		} catch {
			/* 保存服务已展示原因，冲突时保留编辑态。 */
		}
	}
	const download = async () => {
		try {
			await userSpaceFileService.downloadFile(data.file_id, data.file_name)
		} catch {
			magicToast.error(t("topicFiles.downloadFailed"))
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			{showFileHeader && (
				<>
					<CommonHeaderV2
						{...headerProps}
						isEditMode={isEditMode}
						fileContent={editor.snapshot?.content}
						showRefreshButton={false}
						onDownload={() => void download()}
						actionConfig={{
							hideDefaults: ["viewMode", "versionMenu", "share"],
							customActions: [
								{
									key: "user-edit",
									zone: "primary",
									render: () =>
										headerProps.allowEdit !== false && (
											<FileEditButtons
												isEditMode={isEditMode}
												isSaving={editor.saving}
												interactionDisabled={editor.loading || !isTabActive}
												onEdit={() => setIsEditMode(true)}
												onSave={() => saveFromButton()}
												onSaveAndExit={() => saveFromButton(true)}
												onCancel={() => setIsEditMode(false)}
											/>
										),
								},
							],
						}}
					/>
				</>
			)}
			{editor.loadError ? (
				<div
					role="alert"
					className="flex flex-1 flex-col items-center justify-center gap-2 text-sm"
				>
					{t("common.fileNotFoundOrLoadFailed")}
					<Button variant="outline" onClick={() => void editor.load()}>
						{t("userSpace.retry")}
					</Button>
				</div>
			) : (
				<EditorBody
					isLoading={editor.loading}
					content={editor.snapshot?.content ?? ""}
					processedContent={editor.snapshot?.content ?? ""}
					isEditMode={isEditMode}
					editContent={editor.draft}
					setEditContent={editor.setDraft}
					onSave={() => void saveFromButton()}
					isTabActive={isTabActive}
					viewMode={
						isEditMode || headerProps.type !== DetailType.Md ? "code" : "markdown"
					}
					language={
						headerProps.type === DetailType.Md
							? "markdown"
							: data.file_extension || "text"
					}
					className="min-h-0 flex-1 overflow-auto [&_.simple-editor]:p-4"
				/>
			)}
			<MemoryEditConflictDialog
				open={Boolean(editor.conflict)}
				loading={editor.saving}
				onCancel={() => editor.setConflict(null)}
				onUseLatest={editor.useLatest}
				onMerge={editor.merge}
				onOverwrite={() => {
					void editor.save(editor.conflict?.revision).catch(() => {
						/* 冲突或失败保留草稿。 */
					})
				}}
			/>
		</div>
	)
})
