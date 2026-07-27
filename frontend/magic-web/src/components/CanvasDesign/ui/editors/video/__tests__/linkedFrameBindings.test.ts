import { describe, expect, it } from "vitest"
import {
	reconcileLinkedFrameBindings,
	synchronizeLinkedFrameBindings,
} from "../linkedFrameBindings"
import type { LinkedFrameBinding } from "../video-editor-config.types"

function createBinding(framePath: string, frameRole: "start" | "end"): LinkedFrameBinding {
	return {
		framePath,
		sourceConnectionId: `${frameRole}-connection`,
		sourcePath: framePath,
		sourceKind: "image",
		sourceFileName: `${frameRole}.png`,
		frameRole,
	}
}

describe("reconcileLinkedFrameBindings", () => {
	it("clears the linked role when a sparse frame slot is removed", () => {
		const startBinding = createBinding("./images/start.png", "start")
		const endBinding = createBinding("./images/end.png", "end")
		const currentFrameImages = ["./images/start.png", "./images/end.png"]
		delete currentFrameImages[0]

		const result = reconcileLinkedFrameBindings({
			previous: [startBinding, endBinding],
			currentFrameImages,
			supportsStartFrame: true,
			supportsEndFrame: true,
		})

		expect(result).toEqual([undefined, endBinding])
	})

	it("reconstructs a binding instead of treating a sparse slot as unchanged", () => {
		const endBinding = createBinding("./images/shared.png", "end")
		const previous = new Array<LinkedFrameBinding | undefined>(2)
		previous[1] = endBinding

		const result = reconcileLinkedFrameBindings({
			previous,
			currentFrameImages: ["./images/shared.png", "./images/shared.png"],
			supportsStartFrame: true,
			supportsEndFrame: true,
		})

		expect(result).toEqual([{ ...endBinding, frameRole: "start" }, endBinding])
	})
})

describe("synchronizeLinkedFrameBindings", () => {
	it("updates the assigned frame when the connected image source changes", () => {
		const startBinding = createBinding("./images/start-a.png", "start")
		const result = synchronizeLinkedFrameBindings({
			previous: [startBinding],
			currentFrameImages: ["./images/start-a.png"],
			supportsStartFrame: true,
			supportsEndFrame: false,
			linkedMediaItems: [
				{
					connectionId: startBinding.sourceConnectionId,
					kind: "image",
					path: "./images/start-b.png",
					fileName: "start-b.png",
				},
			],
		})

		expect(result.bindings).toEqual([
			{
				...startBinding,
				framePath: "./images/start-b.png",
				sourcePath: "./images/start-b.png",
				sourceFileName: "start-b.png",
			},
		])
		expect(result.frameUpdates).toEqual([
			{ slotIndex: 0, path: "./images/start-b.png", fileName: "start-b.png" },
		])
	})

	it("keeps the current frame snapshot but clears its binding after disconnect", () => {
		const startBinding = createBinding("./images/start.png", "start")
		const result = synchronizeLinkedFrameBindings({
			previous: [startBinding],
			currentFrameImages: ["./images/start.png"],
			supportsStartFrame: true,
			supportsEndFrame: false,
			linkedMediaItems: [],
		})

		expect(result.bindings).toEqual([undefined])
		expect(result.frameUpdates).toEqual([])
	})

	it("keeps the current frame snapshot but clears its binding when the source resource is missing", () => {
		const startBinding = createBinding("./images/start.png", "start")
		const result = synchronizeLinkedFrameBindings({
			previous: [startBinding],
			currentFrameImages: ["./images/start.png"],
			supportsStartFrame: true,
			supportsEndFrame: false,
			linkedMediaItems: [
				{
					connectionId: startBinding.sourceConnectionId,
					kind: "image",
				},
			],
		})

		expect(result.bindings).toEqual([undefined])
		expect(result.frameUpdates).toEqual([])
	})

	it("clears the binding after the frame slot is manually replaced", () => {
		const startBinding = createBinding("./images/linked.png", "start")
		const result = synchronizeLinkedFrameBindings({
			previous: [startBinding],
			currentFrameImages: ["./images/manual.png"],
			supportsStartFrame: true,
			supportsEndFrame: false,
			linkedMediaItems: [
				{
					connectionId: startBinding.sourceConnectionId,
					kind: "image",
					path: startBinding.sourcePath,
				},
			],
		})

		expect(result.bindings).toEqual([undefined])
		expect(result.frameUpdates).toEqual([])
	})

	it("detaches instead of duplicating the same source across both frame roles", () => {
		const startBinding = createBinding("./images/start-a.png", "start")
		const result = synchronizeLinkedFrameBindings({
			previous: [startBinding, undefined],
			currentFrameImages: ["./images/start-a.png", "./images/shared.png"],
			supportsStartFrame: true,
			supportsEndFrame: true,
			linkedMediaItems: [
				{
					connectionId: startBinding.sourceConnectionId,
					kind: "image",
					path: "./images/shared.png",
				},
			],
		})

		expect(result.bindings).toEqual([undefined, undefined])
		expect(result.frameUpdates).toEqual([])
	})

	it("stabilizes after the connected source update reaches the frame slot", () => {
		const startBinding = createBinding("./images/start-b.png", "start")
		const previous = [startBinding]
		const result = synchronizeLinkedFrameBindings({
			previous,
			currentFrameImages: ["./images/start-b.png"],
			supportsStartFrame: true,
			supportsEndFrame: false,
			linkedMediaItems: [
				{
					connectionId: startBinding.sourceConnectionId,
					kind: "image",
					path: "./images/start-b.png",
					fileName: startBinding.sourceFileName,
				},
			],
		})

		expect(result.bindings).toBe(previous)
		expect(result.frameUpdates).toEqual([])
	})
})
