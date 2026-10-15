import { describe, expect, it, vi } from "vitest"
import { applyImportedAssetToVideoSlot, resolveVideoAssetMediaTypes } from "../assetsSelection"

describe("resolveVideoAssetMediaTypes", () => {
	it("limits frame slots to images", () => {
		expect(
			resolveVideoAssetMediaTypes(
				{ inputTab: "frame", slotIndex: 0 },
				{ image: true, video: true, audio: true },
			),
		).toEqual({ assetMediaTypes: ["IMAGE"], canvasMediaTypes: ["image"] })
	})

	it("uses explicit reference slot kinds before model-wide capabilities", () => {
		expect(
			resolveVideoAssetMediaTypes(
				{
					inputTab: "reference",
					slotIndex: 1,
					referenceAssetKinds: ["video", "audio", "video"],
				},
				{ image: true, video: true, audio: true },
			),
		).toEqual({
			assetMediaTypes: ["VIDEO", "AUDIO"],
			canvasMediaTypes: ["video", "audio"],
		})
	})

	it("falls back to the media capabilities supported by the current model", () => {
		expect(
			resolveVideoAssetMediaTypes(
				{ inputTab: "reference", slotIndex: 0 },
				{ image: true, video: false, audio: true },
			),
		).toEqual({
			assetMediaTypes: ["IMAGE", "AUDIO"],
			canvasMediaTypes: ["image", "audio"],
		})
	})

	it("fills a reference slot with the imported media type", () => {
		const handlers = {
			replaceFrameImageAt: vi.fn(),
			replaceReferenceImageAt: vi.fn(),
			setLinkedFrameBindings: vi.fn(),
		}

		applyImportedAssetToVideoSlot({
			slot: { inputTab: "reference", slotIndex: 2 },
			imported: {
				elementId: "audio-element",
				connectionId: "audio-connection",
				workspacePath: "./audios/voice.mp3",
				fileName: "voice.mp3",
				mediaType: "audio",
				source: "downloaded",
			},
			supportsStartFrame: true,
			supportsEndFrame: true,
			handlers: handlers as never,
		})

		expect(handlers.replaceReferenceImageAt).toHaveBeenCalledWith(
			2,
			{
				path: "./audios/voice.mp3",
				src: "./audios/voice.mp3",
				fileName: "voice.mp3",
				assetType: "audio",
			},
			{ ensurePromptMention: true },
		)
		expect(handlers.replaceFrameImageAt).not.toHaveBeenCalled()
	})

	it("asks the reference editor to ensure a mention for an existing connection", () => {
		const handlers = {
			replaceFrameImageAt: vi.fn(),
			replaceReferenceImageAt: vi.fn(),
			setLinkedFrameBindings: vi.fn(),
		}

		applyImportedAssetToVideoSlot({
			slot: { inputTab: "reference", slotIndex: 0 },
			imported: {
				elementId: "image-element",
				connectionId: "image-connection",
				workspacePath: "./images/reference.png",
				fileName: "reference.png",
				mediaType: "image",
				source: "existing-connection",
			},
			supportsStartFrame: true,
			supportsEndFrame: true,
			handlers: handlers as never,
		})

		expect(handlers.replaceReferenceImageAt).toHaveBeenCalledWith(
			0,
			expect.objectContaining({
				path: "./images/reference.png",
				assetType: "image",
			}),
			{ ensurePromptMention: true },
		)
	})

	it("retains the resource slot while applying a batched reference selection", () => {
		const handlers = {
			replaceFrameImageAt: vi.fn(),
			replaceReferenceImageAt: vi.fn(),
			setLinkedFrameBindings: vi.fn(),
		}

		applyImportedAssetToVideoSlot({
			slot: { inputTab: "reference", slotIndex: 1 },
			imported: {
				elementId: "image-element",
				connectionId: "image-connection",
				workspacePath: "./images/reference.png",
				fileName: "reference.png",
				mediaType: "image",
				source: "downloaded",
			},
			supportsStartFrame: true,
			supportsEndFrame: true,
			retainResourceSlot: true,
			handlers: handlers as never,
		})

		expect(handlers.replaceReferenceImageAt).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ assetType: "image" }),
			{ ensurePromptMention: true, retainResourceSlot: true },
		)
	})

	it("fills a frame slot and records the created connection binding", () => {
		let nextBindings: unknown
		const handlers = {
			replaceFrameImageAt: vi.fn(),
			replaceReferenceImageAt: vi.fn(),
			setLinkedFrameBindings: vi.fn((update) => {
				nextBindings = update([])
			}),
		}

		applyImportedAssetToVideoSlot({
			slot: { inputTab: "frame", slotIndex: 1 },
			imported: {
				elementId: "image-element",
				connectionId: "image-connection",
				workspacePath: "./images/end.png",
				fileName: "end.png",
				mediaType: "image",
				source: "existing-binding",
			},
			supportsStartFrame: true,
			supportsEndFrame: true,
			handlers: handlers as never,
		})

		expect(handlers.replaceFrameImageAt).toHaveBeenCalledWith(1, {
			path: "./images/end.png",
			src: "./images/end.png",
			fileName: "end.png",
		})
		expect(nextBindings).toEqual([
			undefined,
			{
				framePath: "./images/end.png",
				sourceConnectionId: "image-connection",
				sourcePath: "./images/end.png",
				sourceKind: "image",
				sourceFileName: "end.png",
				frameRole: "end",
			},
		])
	})
})
