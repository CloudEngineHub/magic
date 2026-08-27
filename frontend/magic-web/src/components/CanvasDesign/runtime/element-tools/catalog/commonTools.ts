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
			resolveTool(
				context,
				ElementToolTypeEnum.ElementResize,
				"top",
				context.element.type === ElementTypeEnum.Frame
					? top("frame-content", 20)
					: top("element", 10),
				{ bindContent: false },
			),
	},
	{
		id: ElementToolTypeEnum.ElementAlign,
		scope: "element",
		execution: "command",
		surfaces: { top: top("layout", 30) },
		isApplicable: (context) =>
			context.selection.elements.length > 1 || context.element.type === ElementTypeEnum.Frame,
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.ElementAlign, "top", top("layout", 30), {
				bindContent: false,
			}),
	},
	{
		id: ElementToolTypeEnum.ElementDistribute,
		scope: "element",
		execution: "command",
		surfaces: { top: top("layout", 31) },
		isApplicable: (context) =>
			context.selection.elements.length > 1 || context.element.type === ElementTypeEnum.Frame,
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.ElementDistribute, "top", top("layout", 31), {
				bindContent: false,
			}),
	},
	{
		id: ElementToolTypeEnum.FrameRemove,
		scope: "element",
		execution: "command",
		surfaces: { top: top("frame-action", 10) },
		isApplicable: (context) =>
			context.selection.isSingleElement && context.element.type === ElementTypeEnum.Frame,
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.FrameRemove, "top", top("frame-action", 10), {
				bindContent: false,
			}),
	},
	{
		id: ElementToolTypeEnum.FrameDownload,
		scope: "element",
		execution: "command",
		surfaces: { top: top("frame-content", 21) },
		isApplicable: (context) =>
			context.selection.isSingleElement && context.element.type === ElementTypeEnum.Frame,
		resolve: (context) =>
			resolveTool(
				context,
				ElementToolTypeEnum.FrameDownload,
				"top",
				top("frame-content", 21),
				{
					bindContent: false,
				},
			),
	},
	{
		id: ElementToolTypeEnum.FrameStoryboardVideoBatch,
		scope: "element",
		execution: "command",
		surfaces: { top: top("frame-content", 22) },
		isApplicable: (context) =>
			context.selection.isSingleElement &&
			context.element.type === ElementTypeEnum.Frame &&
			context.flags.isStoryboardOutputFrame,
		resolve: (context) =>
			resolveTool(
				context,
				ElementToolTypeEnum.FrameStoryboardVideoBatch,
				"top",
				top("frame-content", 22),
				{ bindContent: false },
			),
	},
	{
		id: ElementToolTypeEnum.FrameCreate,
		scope: "element",
		execution: "command",
		surfaces: { top: top("frame-create", 10) },
		isApplicable: (context) =>
			context.selection.elements.length > 1 &&
			!context.selection.elements.some((element) => element.type === ElementTypeEnum.Frame),
		resolve: (context) =>
			resolveTool(context, ElementToolTypeEnum.FrameCreate, "top", top("frame-create", 10), {
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
		ElementToolTypeEnum.ContentMediaOriginalSize,
		"element",
		11,
		(context) =>
			(context.element.type === ElementTypeEnum.Image ||
				context.element.type === ElementTypeEnum.Video) &&
			context.flags.showMediaOriginalSize &&
			mediaContentToolAllowed(context),
	),
]
