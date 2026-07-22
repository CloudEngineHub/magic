import type { ReferenceResourcePanelItem } from "../../../../public/props"
import { CANVAS_REFERENCE_MENTION_ITEM_TYPE } from "./canvasReferenceMention.constants"
import type { ReferenceDropProjectFile } from "./useReferenceResourcePanelDataService"

export function getFileExtension(filePath: string): string {
	const lastDotIndex = filePath.lastIndexOf(".")
	if (lastDotIndex < 0) return ""
	return filePath.slice(lastDotIndex + 1)
}

export function createReferenceResourcePanelItemFromPath(
	path: string,
	fileName: string,
): ReferenceResourcePanelItem {
	return {
		type: CANVAS_REFERENCE_MENTION_ITEM_TYPE.projectFile,
		data: {
			file_id: path,
			file_name: fileName,
			file_path: path,
			file_extension: getFileExtension(path),
		},
	}
}

export function createReferenceResourcePanelItemFromDropFile(
	file: ReferenceDropProjectFile,
): ReferenceResourcePanelItem {
	return createReferenceResourcePanelItemFromPath(file.path, file.fileName)
}
