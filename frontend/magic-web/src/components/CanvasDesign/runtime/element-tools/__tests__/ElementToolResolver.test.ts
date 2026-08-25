import { describe, expect, it, vi } from "vitest"
import { ElementToolTypeEnum } from "../../../public/props"
import { ElementTypeEnum, type ImageElement } from "../../document/types"
import { createElementToolContext } from "../model/ElementToolContext"
import { resolveElementTools } from "../resolver/ElementToolResolver"

function createImage(overrides: Partial<ImageElement> = {}): ImageElement {
	return {
		id: "image-1",
		type: ElementTypeEnum.Image,
		activeContentId: "content-a",
		mainContentId: "content-a",
		contents: [{ contentId: "content-a", src: "a.png", status: "completed" }],
		...overrides,
	}
}

function resolve(
	image: ImageElement,
	options?: Omit<Parameters<typeof createElementToolContext>[0], "selectedElements">,
) {
	const context = createElementToolContext({
		selectedElements: [image],
		...options,
	})
	if (!context) throw new Error("expected a tool context")
	return {
		context,
		top: resolveElementTools(context, "top"),
		bottom: resolveElementTools(context, "bottom"),
	}
}

describe("ElementToolResolver", () => {
	it("keeps the completed active Content operable while a sibling is processing", () => {
		const { context, top, bottom } = resolve(
			createImage({
				contents: [
					{ contentId: "content-a", src: "a.png", status: "completed" },
					{ contentId: "content-b", src: "b.png", status: "processing" },
				],
			}),
		)

		expect(context.generation.activeContentIsGenerating).toBe(false)
		expect(context.generation.siblingGeneratingContentIds).toEqual(["content-b"])
		expect(top.map((tool) => tool.id)).toEqual(
			expect.arrayContaining([
				ElementToolTypeEnum.ContentCrop,
				ElementToolTypeEnum.ContentReplace,
				ElementToolTypeEnum.ContentDownload,
			]),
		)
		expect(bottom.map((tool) => tool.id)).toEqual(
			expect.arrayContaining([
				ElementToolTypeEnum.GenerationQuickEdit,
				ElementToolTypeEnum.GenerationReEdit,
				ElementToolTypeEnum.GenerationGenerateAgain,
			]),
		)
		expect(bottom.some((tool) => tool.id === ElementToolTypeEnum.VersionDelete)).toBe(false)
	})

	it("limits an active processing Content to safe operations", () => {
		const { context, top, bottom } = resolve(
			createImage({
				activeContentId: "content-b",
				contents: [
					{ contentId: "content-a", src: "a.png", status: "completed" },
					{ contentId: "content-b", src: "b.png", status: "processing" },
				],
			}),
		)

		expect(context.generation.activeContentIsGenerating).toBe(true)
		expect(top.map((tool) => tool.id)).toEqual([ElementToolTypeEnum.ContentDownload])
		expect(bottom.map((tool) => tool.id)).not.toContain(
			ElementToolTypeEnum.GenerationGenerateAgain,
		)
		expect(bottom.map((tool) => tool.id)).toContain(ElementToolTypeEnum.VersionPrevious)
		expect(bottom.map((tool) => tool.id)).toContain(ElementToolTypeEnum.VersionNext)
		expect(bottom.map((tool) => tool.id)).not.toContain(ElementToolTypeEnum.VersionDelete)
	})

	it("captures the active Content target instead of re-reading it later", () => {
		const image = createImage({
			contents: [
				{ contentId: "content-a", src: "a.png", status: "completed" },
				{ contentId: "content-b", src: "b.png", status: "completed" },
			],
		})
		const context = createElementToolContext({ selectedElements: [image] })
		if (!context) throw new Error("expected a tool context")
		const tool = resolveElementTools(context, "top").find(
			(item) => item.id === ElementToolTypeEnum.ContentCrop,
		)
		if (!tool) throw new Error("expected crop tool")

		image.activeContentId = "content-b"
		expect(tool.target).toEqual({ elementId: "image-1", contentId: "content-a" })
	})

	it("does not attach a Content target to element-scoped tools", () => {
		const frame = {
			id: "frame-1",
			type: ElementTypeEnum.Frame,
			contents: [],
		} as never
		const context = createElementToolContext({ selectedElements: [frame] })
		if (!context) throw new Error("expected a tool context")
		const resize = resolveElementTools(context, "top").find(
			(item) => item.id === ElementToolTypeEnum.ElementResize,
		)
		expect(resize?.target).toEqual({ elementId: "frame-1" })
	})

	it("does not expose unsafe tools while the element is being replaced", () => {
		const { top, bottom } = resolve(createImage(), { isReplacing: true })
		expect(top).toEqual([])
		expect(bottom).toEqual([])
	})

	it("hides the bottom surface during an active Content tool session", () => {
		const { bottom } = resolve(createImage(), {
			activeToolSession: {
				toolId: ElementToolTypeEnum.ContentEnhance,
				elementId: "image-1",
				contentId: "content-a",
				operationId: "operation-1",
			},
		})

		expect(bottom).toEqual([])
	})

	it("hides the bottom surface while a media editor is mounted", () => {
		const { bottom } = resolve(createImage(), { isEditing: true })

		expect(bottom).toEqual([])
	})

	it("includes runtime-only generation targets in version capabilities", () => {
		const image = createImage({
			contents: [
				{ contentId: "content-a", src: "a.png", status: "completed" },
				{ contentId: "content-b", src: "b.png", status: "completed" },
			],
		})
		const { bottom } = resolve(image, {
			canvas: {
				generationRuntimeManager: {
					getTargetStates: () => [
						{
							elementId: image.id,
							contentId: "content-b",
							attemptId: "attempt-b",
							operation: "image-generate",
							phase: "processing",
						},
					],
				},
			} as never,
		})

		expect(bottom.some((tool) => tool.id === ElementToolTypeEnum.VersionDelete)).toBe(false)
		expect(bottom.some((tool) => tool.id === ElementToolTypeEnum.VersionSetMain)).toBe(true)
	})

	it("blocks setting the main version when the active target is runtime-generating", () => {
		const image = createImage({
			contents: [
				{ contentId: "content-a", src: "a.png", status: "completed" },
				{ contentId: "content-b", src: "b.png", status: "completed" },
			],
		})
		const { bottom } = resolve(image, {
			canvas: {
				generationRuntimeManager: {
					getTargetStates: () => [
						{
							elementId: image.id,
							contentId: "content-a",
							attemptId: "attempt-a",
							operation: "image-generate",
							phase: "processing",
						},
					],
				},
			} as never,
		})

		expect(bottom.some((tool) => tool.id === ElementToolTypeEnum.VersionSetMain)).toBe(false)
	})
})

describe("ElementToolResolver command targets", () => {
	it("keeps command targets independent from active version changes", () => {
		const image = createImage()
		const context = createElementToolContext({ selectedElements: [image] })
		if (!context) throw new Error("expected a tool context")
		const tool = resolveElementTools(context, "top").find(
			(item) => item.id === ElementToolTypeEnum.ContentDownload,
		)
		const execute = vi.fn()
		if (!tool) throw new Error("expected download tool")
		tool.execute = execute
		image.activeContentId = "content-b"
		tool.execute()
		expect(tool.target.contentId).toBe("content-a")
	})
})
