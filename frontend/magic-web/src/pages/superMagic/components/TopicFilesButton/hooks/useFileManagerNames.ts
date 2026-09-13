import { useTranslation } from "react-i18next"
import { useRename } from "./useRename"
import { useVirtualFile } from "./useVirtualFile"
import { useVirtualFolder } from "./useVirtualFolder"
import { useVirtualDesignProject } from "./useVirtualDesignProject"
import { useVirtualSelfMediaProject } from "./useVirtualSelfMediaProject"
import type { useFileOperations } from "./useFileOperations"
import type { FileManagerProps } from "../components/FileManager/types"

const expandedKeys: React.Key[] = []
const setExpandedKeys = () => undefined

/** 管理器只把原行内命名流程放到对话框；校验、冲突和提交仍由原 hook 持有。 */
export function useFileManagerNames(
	props: FileManagerProps,
	operations: ReturnType<typeof useFileOperations>,
) {
	const { t } = useTranslation("super")
	const callbacks = props.spaceConfig?.operations
	const rename = useRename({
		projectId: props.projectId,
		fileScope: props.spaceConfig?.scope,
		attachments: props.attachments,
		onUpdateAttachments: props.onRefresh,
		isCurrent: callbacks?.isCurrent,
		allowDotStart: callbacks?.allowDotStart,
		resolveSiblings: callbacks?.resolveSiblings,
		beforeRename: callbacks?.beforeRename,
		onRenameSuccess: callbacks?.onRenameSuccess,
	})
	const common = {
		attachments: props.attachments,
		isCurrent: callbacks?.isCurrent,
		allowDotStart: callbacks?.allowDotStart,
		resolveSiblings: callbacks?.resolveCreateSiblings,
	}
	const file = useVirtualFile({ ...common, onFileCreate: operations.createFileAndUpload })
	const folder = useVirtualFolder({ ...common, onFolderCreate: operations.createFolderAndUpload })
	const design = useVirtualDesignProject({
		attachments: props.attachments,
		expandedKeys,
		setExpandedKeys,
		onDesignProjectCreate: operations.createDesignProject,
	})
	const selfMedia = useVirtualSelfMediaProject({
		attachments: props.attachments,
		expandedKeys,
		setExpandedKeys,
		onSelfMediaProjectCreate: operations.createSelfMediaProject,
	})
	const inputs = [
		{
			id: rename.renamingItemId,
			title: t("userSpace.rename"),
			value: rename.renameValue,
			setValue: rename.setRenameValue,
			inputRef: rename.renameInputRef,
			error: rename.renameErrorMessage,
			confirm: rename.handleRenameConfirm,
			cancel: rename.handleRenameCancel,
		},
		{
			id: file.editingVirtualId,
			title: t("userSpace.createFile"),
			value: file.virtualFileName,
			setValue: file.setVirtualFileName,
			inputRef: file.virtualInputRef,
			error: file.errorMessage,
			confirm: file.confirmVirtualFile,
			cancel: file.cancelVirtualFile,
		},
		{
			id: folder.editingVirtualId,
			title: t("userSpace.createFolder"),
			value: folder.virtualFolderName,
			setValue: folder.setVirtualFolderName,
			inputRef: folder.virtualInputRef,
			error: folder.errorMessage,
			confirm: folder.confirmVirtualFolder,
			cancel: folder.cancelVirtualFolder,
		},
		{
			id: design.editingVirtualId,
			title: t("topicFiles.contextMenu.createSubMenu.designFile"),
			value: design.virtualDesignProjectName,
			setValue: design.setVirtualDesignProjectName,
			inputRef: design.virtualInputRef,
			error: design.errorMessage,
			confirm: design.confirmVirtualDesignProject,
			cancel: design.cancelVirtualDesignProject,
		},
		{
			id: selfMedia.editingVirtualId,
			title: t("topicFiles.contextMenu.createSubMenu.selfMediaFile"),
			value: selfMedia.virtualSelfMediaProjectName,
			setValue: selfMedia.setVirtualSelfMediaProjectName,
			inputRef: selfMedia.virtualInputRef,
			error: selfMedia.errorMessage,
			confirm: selfMedia.confirmVirtualSelfMediaProject,
			cancel: selfMedia.cancelVirtualSelfMediaProject,
		},
	]
	return {
		rename,
		file,
		folder,
		design,
		selfMedia,
		input: inputs.find((input) => input.id),
		pending:
			rename.renamePending ||
			file.isCreating ||
			folder.isCreating ||
			operations.creatingFiles.size > 0,
	}
}
