import type { VideoModelItem } from "../../../public/magic-types"
import type { Canvas } from "../../core/Canvas"
import { resolveVideoContinuationModel } from "../video-continuation/videoContinuationModel"
import type { SelectionContentSnapshot } from "./selectionContentCollector"

export interface ConnectionMenuActionContext {
	canvas: Canvas
	snapshot: SelectionContentSnapshot
	originSide: "left" | "right"
	videoModelList: VideoModelItem[]
}

export interface ConnectionMenuActionRecipe {
	id: string
	supportedSides: Array<"left" | "right">
	getLabel: (snapshot: SelectionContentSnapshot) => { key: string; fallback: string }
	match: (context: ConnectionMenuActionContext) => boolean
	execute: (context: ConnectionMenuActionContext) => Promise<void>
}

const VIDEO_CONTINUATION_RECIPE: ConnectionMenuActionRecipe = {
	id: "video-continuation",
	supportedSides: ["right"],
	getLabel: (snapshot) =>
		snapshot.mainVideoSequence.length > 1
			? { key: "videoContinuation.batchMenu", fallback: "批量续写视频" }
			: { key: "videoContinuation.menu", fallback: "续写视频" },
	match: ({ canvas, snapshot, videoModelList }) =>
		snapshot.allRootsCanConnect &&
		snapshot.mainVideoSequence.length > 0 &&
		Boolean(resolveVideoContinuationModel(canvas, videoModelList)),
	execute: async ({ canvas, snapshot, videoModelList }) => {
		await canvas.videoContinuationManager.continueVideos({
			sourceVideoIds: snapshot.mainVideoSequence,
			videoModelList,
		})
	},
}

const CONNECTION_MENU_ACTION_RECIPES: readonly ConnectionMenuActionRecipe[] = [
	VIDEO_CONTINUATION_RECIPE,
]

export function getConnectionMenuActionRecipes(
	context: ConnectionMenuActionContext,
): ConnectionMenuActionRecipe[] {
	return CONNECTION_MENU_ACTION_RECIPES.filter(
		(recipe) => recipe.supportedSides.includes(context.originSide) && recipe.match(context),
	)
}
