export const CANVAS_REFERENCE_MENTION_ITEM_TYPE = {
	projectFile: "project_file",
	folder: "project_directory",
} as const

export type CanvasReferenceMentionItemType =
	(typeof CANVAS_REFERENCE_MENTION_ITEM_TYPE)[keyof typeof CANVAS_REFERENCE_MENTION_ITEM_TYPE]

export type CanvasReferenceMentionProjectFileType =
	typeof CANVAS_REFERENCE_MENTION_ITEM_TYPE.projectFile

export const CANVAS_REFERENCE_MENTION_PANEL_STATE = {
	default: "default",
	folder: "directory",
	search: "search",
	catalog: "catalog",
} as const

export type CanvasReferenceMentionPanelState =
	(typeof CANVAS_REFERENCE_MENTION_PANEL_STATE)[keyof typeof CANVAS_REFERENCE_MENTION_PANEL_STATE]
