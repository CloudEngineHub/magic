import { act, renderHook } from "@testing-library/react"
import { createRef } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MessageEditorRef } from "../../message/MessageEditor"

const mocks = vi.hoisted(() => ({
	useLinkedEditorInputs: vi.fn(),
	useLinkedMediaMentionSelection: vi.fn(),
}))

vi.mock("../useLinkedEditorInputs", () => ({
	useLinkedEditorInputs: mocks.useLinkedEditorInputs,
}))

vi.mock("../useLinkedMediaMentionSelection", () => ({
	useLinkedMediaMentionSelection: mocks.useLinkedMediaMentionSelection,
}))

import { useLinkedMediaAssociationController } from "../useLinkedMediaAssociationController"

describe("useLinkedMediaAssociationController", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.useLinkedEditorInputs.mockReturnValue({
			mediaItems: [],
			canSelectMediaConnection: vi.fn(() => true),
		})
		mocks.useLinkedMediaMentionSelection.mockReturnValue(vi.fn())
	})

	it("accepts only the latest pending sync and supports editor revision resets", () => {
		const onReadyMentionChange = vi.fn()
		const editorRef = createRef<MessageEditorRef>()
		const { result } = renderHook(() =>
			useLinkedMediaAssociationController({
				targetElementId: "target-image",
				targetKind: "image",
				mediaPolicy: { supportedKinds: ["image"] },
				editorRef,
				onReadyMentionChange,
			}),
		)

		act(() => {
			expect(
				result.current.handleMentionChange(["./images/pending.png"], "@pending.png", {
					source: "sync",
					status: "pending",
					revision: 1,
				}),
			).toBe(false)
		})
		expect(result.current.mentionedReferencePaths).toEqual([])
		expect(onReadyMentionChange).not.toHaveBeenCalled()

		act(() => {
			expect(
				result.current.handleMentionChange(["./images/ready.png"], "@ready.png", {
					source: "sync",
					status: "ready",
					revision: 1,
				}),
			).toBe(true)
		})
		expect(result.current.mentionedReferencePaths).toEqual(["./images/ready.png"])
		expect(onReadyMentionChange).toHaveBeenCalledWith(["./images/ready.png"], "@ready.png")

		act(() => {
			expect(
				result.current.handleMentionChange(["./images/next.png"], "@next.png", {
					source: "sync",
					status: "pending",
					revision: 2,
				}),
			).toBe(false)
			expect(
				result.current.handleMentionChange(["./images/stale.png"], "@stale.png", {
					source: "sync",
					status: "ready",
					revision: 1,
				}),
			).toBe(false)
		})
		expect(result.current.mentionedReferencePaths).toEqual(["./images/ready.png"])

		act(() => {
			expect(
				result.current.handleMentionChange(["./images/next.png"], "@next.png", {
					source: "sync",
					status: "ready",
					revision: 2,
				}),
			).toBe(true)
		})
		expect(result.current.mentionedReferencePaths).toEqual(["./images/next.png"])

		act(() => {
			result.current.handleMentionChange(["./images/remounted.png"], "@remounted.png", {
				source: "sync",
				status: "pending",
				revision: 1,
			})
			expect(
				result.current.handleMentionChange(["./images/remounted.png"], "@remounted.png", {
					source: "sync",
					status: "ready",
					revision: 1,
				}),
			).toBe(true)
		})
		expect(result.current.mentionedReferencePaths).toEqual(["./images/remounted.png"])
	})
})
