import { describe, expect, it } from "vitest"
import {
	cloneModeDraftCache,
	mergeCurrentUiIntoModeDraftCache,
} from "../draft/video-editor-config.draft"
import type { LinkedFrameBinding, VideoModeInputDraft } from "../video-editor-config.types"

function createBinding(path: string): LinkedFrameBinding {
	return {
		framePath: path,
		sourceConnectionId: "connection-image",
		sourcePath: path,
		sourceKind: "image",
		sourceFileName: "frame.png",
		frameRole: "start",
	}
}

describe("video mode draft linked frame bindings", () => {
	it("clones persisted bindings without sharing mutable references", () => {
		const binding = createBinding("./images/frame.png")
		const source: Partial<Record<"keyframe_guided", VideoModeInputDraft>> = {
			keyframe_guided: {
				frameImageInfos: [],
				referenceAssetInfos: [],
				linkedFrameBindings: [binding],
			},
		}

		const cloned = cloneModeDraftCache(source)

		expect(cloned.keyframe_guided?.linkedFrameBindings).toEqual([binding])
		expect(cloned.keyframe_guided?.linkedFrameBindings?.[0]).not.toBe(binding)
	})

	it("saves bindings with the current input mode draft", () => {
		const binding = createBinding("./images/frame.png")
		const merged = mergeCurrentUiIntoModeDraftCache(
			{},
			"keyframe_guided",
			"prompt",
			"frame",
			[{ path: binding.framePath, src: binding.framePath, fileName: binding.sourceFileName }],
			[],
			[binding],
		)

		expect(merged.keyframe_guided?.linkedFrameBindings).toEqual([binding])
		expect(merged.keyframe_guided?.linkedFrameBindings?.[0]).not.toBe(binding)
	})
})
