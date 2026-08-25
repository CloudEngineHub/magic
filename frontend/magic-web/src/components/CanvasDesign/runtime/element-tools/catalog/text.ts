import { ElementToolTypeEnum } from "../../../public/props"
import { ElementTypeEnum } from "../../document/types"
import type { ElementToolDefinition } from "../model/ElementToolTypes"
import { topTool } from "./common"

const textTools = [
	[ElementToolTypeEnum.TextFillColor, 10],
	[ElementToolTypeEnum.TextFontFamily, 20],
	[ElementToolTypeEnum.TextFontSize, 21],
	[ElementToolTypeEnum.TextFontStyle, 30],
	[ElementToolTypeEnum.TextAlign, 40],
	[ElementToolTypeEnum.TextAdvanced, 50],
	[ElementToolTypeEnum.TextDownload, 60],
	[ElementToolTypeEnum.TextContentOptimization, 61],
] as const

export const TEXT_TOOL_DEFINITIONS: ElementToolDefinition[] = textTools.map(([id, order]) =>
	topTool(
		id,
		"active-content",
		"text",
		order,
		(context) =>
			context.selection.isSingleElement && context.element.type === ElementTypeEnum.Text,
	),
)
