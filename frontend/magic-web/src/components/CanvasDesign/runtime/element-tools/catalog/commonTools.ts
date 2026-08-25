import { ElementToolTypeEnum } from "../../../public/props"
import { ElementTypeEnum } from "../../document/types"
import type { ElementToolDefinition } from "../model/ElementToolTypes"
import { mediaContentToolAllowed, mediaTool, hasResource, isMedia, resolveTool } from "./common"
import { topAction, topCustom } from "./surfaceOptions"

const top = (group: string, order: number) => topAction(group, order)

export const COMMON_ELEMENT_TOOL_DEFINITIONS: ElementToolDefinition[] = [
	{
		id: ElementToolTypeEnum.ElementResize,
		scope: "element",
		execution: "command",
		surfaces: { top: top("element", 10) },
		isApplicable: (context) =>
			context.selection.isSingleElement &&
			(context.element.type === ElementTypeEnum.Frame ||
				(context.element.type === ElementTypeEnum.Image &&
					!context.generation.activeContentIsGenerating &&
					hasResource(context))),
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.ElementResize, "top", top("element", 10), {
				bindContent: false,
			}),
	},
	{
		id: ElementToolTypeEnum.ElementAlign,
		scope: "element",
		execution: "command",
		surfaces: { top: top("layout", 100) },
		isApplicable: (context) =>
			context.selection.elements.length > 1 || context.element.type === ElementTypeEnum.Frame,
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.ElementAlign, "top", top("layout", 100), {
				bindContent: false,
			}),
	},
	{
		id: ElementToolTypeEnum.ElementDistribute,
		scope: "element",
		execution: "command",
		surfaces: { top: top("layout", 110) },
		isApplicable: (context) =>
			context.selection.elements.length > 1 || context.element.type === ElementTypeEnum.Frame,
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.ElementDistribute, "top", top("layout", 110), {
				bindContent: false,
			}),
	},
	{
		id: ElementToolTypeEnum.FrameRemove,
		scope: "element",
		execution: "command",
		surfaces: { top: top("frame", 0) },
		isApplicable: (context) =>
			context.selection.isSingleElement && context.element.type === ElementTypeEnum.Frame,
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.FrameRemove, "top", top("frame", 0), {
				bindContent: false,
			}),
	},
	{
		id: ElementToolTypeEnum.FrameDownload,
		scope: "element",
		execution: "command",
		surfaces: { top: top("frame", 20) },
		isApplicable: (context) =>
			context.selection.isSingleElement && context.element.type === ElementTypeEnum.Frame,
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.FrameDownload, "top", top("frame", 20), {
				bindContent: false,
			}),
	},
	{
		id: ElementToolTypeEnum.FrameStoryboardVideoBatch,
		scope: "element",
		execution: "command",
		surfaces: { top: top("frame", 30) },
		isApplicable: (context) =>
			context.selection.isSingleElement &&
			context.element.type === ElementTypeEnum.Frame &&
			context.flags.isStoryboardOutputFrame,
		resolve: (context) =>
			resolveTool(
				context,
				ElementToolTypeEnum.FrameStoryboardVideoBatch,
				"top",
				top("frame", 30),
				{ bindContent: false },
			),
	},
	{
		id: ElementToolTypeEnum.FrameCreate,
		scope: "element",
		execution: "command",
		surfaces: { top: top("frame", 0) },
		isApplicable: (context) =>
			context.selection.elements.length > 1 &&
			!context.selection.elements.some((element) => element.type === ElementTypeEnum.Frame),
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.FrameCreate, "top", top("frame", 0), {
				bindContent: false,
			}),
	},
	{
		id: ElementToolTypeEnum.ContentDownload,
		scope: "active-content",
		execution: "command",
		surfaces: { top: top("media", 90) },
		isApplicable: (context) =>
			context.selection.isSingleElement && isMedia(context) && hasResource(context),
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.ContentDownload, "top", top("media", 90)),
	},
	{
		id: ElementToolTypeEnum.ContentReplace,
		scope: "active-content",
		execution: "command",
		surfaces: { top: top("media", 80) },
		isApplicable: (context) =>
			context.selection.isSingleElement &&
			isMedia(context) &&
			!context.generation.activeContentIsGenerating &&
			(hasResource(context) || context.element.type === ElementTypeEnum.Audio),
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.ContentReplace, "top", top("media", 80)),
	},
	mediaTool(
		ElementToolTypeEnum.ContentCrop,
		"image-edit",
		20,
		(context) =>
			context.element.type === ElementTypeEnum.Image && mediaContentToolAllowed(context),
	),
	mediaTool(
		ElementToolTypeEnum.ContentExtend,
		"image-edit",
		21,
		(context) =>
			context.element.type === ElementTypeEnum.Image && mediaContentToolAllowed(context),
	),
	mediaTool(
		ElementToolTypeEnum.ContentRemoveBackground,
		"image-edit",
		22,
		(context) =>
			context.element.type === ElementTypeEnum.Image && mediaContentToolAllowed(context),
	),
	mediaTool(
		ElementToolTypeEnum.ContentEraser,
		"image-edit",
		23,
		(context) =>
			context.element.type === ElementTypeEnum.Image && mediaContentToolAllowed(context),
	),
	mediaTool(
		ElementToolTypeEnum.ContentEnhance,
		"image-edit",
		30,
		(context) =>
			context.element.type === ElementTypeEnum.Image &&
			context.flags.convertHightSupported &&
			mediaContentToolAllowed(context),
		topCustom("image-edit", 30),
	),
	mediaTool(
		ElementToolTypeEnum.ContentPromptExtraction,
		"image-edit",
		40,
		(context) =>
			context.element.type === ElementTypeEnum.Image && mediaContentToolAllowed(context),
	),
	mediaTool(
		ElementToolTypeEnum.ContentVideoOriginalSize,
		"media",
		10,
		(context) =>
			context.element.type === ElementTypeEnum.Video &&
			context.flags.showVideoOriginalSize &&
			mediaContentToolAllowed(context),
	),
]
