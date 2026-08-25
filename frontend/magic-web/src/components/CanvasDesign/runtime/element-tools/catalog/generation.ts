import { ElementToolTypeEnum } from "../../../public/props"
import { ElementTypeEnum } from "../../document/types"
import type { ElementToolDefinition } from "../model/ElementToolTypes"
import { bottomAction } from "./surfaceOptions"
import { generationToolAllowed, resolveRuntimeTool } from "./common"

const isGenerationMedia = (context: Parameters<ElementToolDefinition["isApplicable"]>[0]) =>
	(context.element.type === ElementTypeEnum.Image ||
		context.element.type === ElementTypeEnum.Video) &&
	context.selection.isSingleElement &&
	generationToolAllowed(context) &&
	!context.interaction.isEditing

export const GENERATION_TOOL_DEFINITIONS: ElementToolDefinition[] = [
	{
		id: ElementToolTypeEnum.GenerationQuickEdit,
		scope: "generation",
		execution: "command",
		surfaces: {
			bottom: bottomAction("pencil", "imageEditor.quickEdit", "快捷编辑", "generation", 10),
		},
		isApplicable: (context) =>
			isGenerationMedia(context) &&
			(context.runtime.toolsById.get(ElementToolTypeEnum.GenerationQuickEdit)?.available ??
				true),
		resolve: (context) =>
			resolveRuntimeTool(
				context,
				ElementToolTypeEnum.GenerationQuickEdit,
				bottomAction("pencil", "imageEditor.quickEdit", "快捷编辑", "generation", 10),
			),
	},
	{
		id: ElementToolTypeEnum.GenerationReEdit,
		scope: "generation",
		execution: "command",
		surfaces: {
			bottom: bottomAction(
				"square-pen",
				"imageEditor.reEditFromSaved",
				"重新编辑",
				"generation",
				20,
			),
		},
		isApplicable: (context) =>
			isGenerationMedia(context) &&
			context.capabilities.canGenerateContent &&
			(context.runtime.toolsById.get(ElementToolTypeEnum.GenerationReEdit)?.available ??
				true),
		resolve: (context) =>
			resolveRuntimeTool(
				context,
				ElementToolTypeEnum.GenerationReEdit,
				bottomAction(
					"square-pen",
					"imageEditor.reEditFromSaved",
					"重新编辑",
					"generation",
					20,
				),
			),
	},
	{
		id: ElementToolTypeEnum.GenerationGenerateAgain,
		scope: "generation",
		execution: "command",
		surfaces: {
			bottom: bottomAction(
				"rotate-ccw",
				"imageEditor.generateAgain",
				"再次生成",
				"generation",
				30,
			),
		},
		isApplicable: (context) =>
			isGenerationMedia(context) &&
			context.capabilities.canGenerateContent &&
			(context.runtime.toolsById.get(ElementToolTypeEnum.GenerationGenerateAgain)
				?.available ??
				true),
		resolve: (context) =>
			resolveRuntimeTool(
				context,
				ElementToolTypeEnum.GenerationGenerateAgain,
				bottomAction(
					"rotate-ccw",
					"imageEditor.generateAgain",
					"再次生成",
					"generation",
					30,
				),
			),
	},
]
