import i18next from "i18next"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import { getFolderMentionData } from "@/components/business/MentionPanel/utils/directoryMention"
import { normalizeProjectReferencePath } from "@/components/business/MentionPanel/utils/projectReferenceMention"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	createDesignProjectFiles,
	type CreatedDesignProjectFiles,
} from "@/pages/superMagic/components/Detail/contents/Design/utils/designProjectCreation"

function getCreatedTime(item: AttachmentItem): number {
	const time = Date.parse(String(item.created_at ?? ""))
	return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

/**
 * Picks the canvas an AI canvas project shows.
 *
 * Only root-level canvas folders count, so a canvas nested elsewhere by the user or the agent
 * never replaces the default one. With several root canvases the earliest created wins; items
 * without a creation time keep their tree order behind dated ones.
 */
export function findAiCanvasFolder(tree: AttachmentItem[]): AttachmentItem | null {
	const canvases = tree.filter(
		(item) => item.is_directory && item.display_config?.type === "design",
	)
	if (canvases.length === 0) return null
	return canvases.reduce((earliest, item) =>
		getCreatedTime(item) < getCreatedTime(earliest) ? item : earliest,
	)
}

/** Builds the same folder mention a user gets by @-referencing the canvas folder. */
export function buildAiCanvasMention(folder: {
	file_id?: string
	name?: string
	file_name?: string
	relative_file_path?: string
	display_config?: unknown
}): MentionListItem {
	const directoryName = folder.file_name || folder.name || ""
	return {
		type: "mention",
		attrs: {
			type: MentionItemType.FOLDER,
			data: getFolderMentionData({
				directoryId: folder.file_id,
				directoryName,
				directoryPath: normalizeProjectReferencePath(
					folder.relative_file_path || directoryName,
				),
				directoryMetadata: folder.display_config ?? { type: "design" },
			}),
		},
	}
}

/** Default canvas folder name, localized like the file tree's "new canvas" action. */
export function getAiCanvasDefaultFolderName(): string {
	return i18next.t("topicFiles.contextMenu.newDesign.defaultName", { ns: "super" })
}

/** Creates the default root canvas of an AI canvas project with the shared canvas writer. */
export function createAiCanvasDocument(projectId: string): Promise<CreatedDesignProjectFiles> {
	return createDesignProjectFiles({
		projectId,
		folderName: getAiCanvasDefaultFolderName(),
	})
}
