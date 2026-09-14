import { act, render, waitFor } from "@testing-library/react"
import { useRef } from "react"
import type { RefObject } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EditorMessageType } from "../../iframe-bridge/types/messages"
import type { HTMLEditorV2Ref } from "../../iframe-bridge/types/props"
import { useHTMLEditorV2 } from "../useHTMLEditorV2"

const bridgeState = vi.hoisted(() => ({
	instances: [] as Array<{
		request: ReturnType<typeof vi.fn>
		sendCommand: ReturnType<typeof vi.fn>
		on: ReturnType<typeof vi.fn>
		isActive: ReturnType<typeof vi.fn>
		destroy: ReturnType<typeof vi.fn>
		emit: (type: string, payload?: unknown) => void
	}>,
	requests: [] as string[],
	activationMessages: [] as unknown[],
}))

vi.mock("@/utils/env", () => ({
	env: vi.fn(() => ""),
}))

vi.mock("../../iframe-bridge/contexts/StylePanelContext", () => ({
	useStylePanelStore: () => ({
		reset: vi.fn(),
		clearSelectedElements: vi.fn(),
		selectElement: vi.fn(),
		setSelectionMode: vi.fn(),
		updateHistoryState: vi.fn(),
		selectedElement: null,
		selectedElements: [],
		textSelection: null,
	}),
}))

vi.mock("../../iframe-bridge/bridge/MessageBridge", () => ({
	MessageBridge: vi.fn().mockImplementation(() => {
		const handlers = new Map<string, Array<(message: { payload?: unknown }) => void>>()
		const instance = {
			request: vi.fn(async (type: string) => {
				bridgeState.requests.push(type)
				return {}
			}),
			sendCommand: vi.fn(async () => undefined),
			on: vi.fn((type: string, handler: (message: { payload?: unknown }) => void) => {
				const nextHandlers = handlers.get(type) ?? []
				nextHandlers.push(handler)
				handlers.set(type, nextHandlers)
			}),
			isActive: vi.fn(() => true),
			destroy: vi.fn(),
			emit: (type: string, payload?: unknown) => {
				for (const handler of handlers.get(type) ?? []) {
					handler({ payload })
				}
			},
		}
		bridgeState.instances.push(instance)
		return instance
	}),
}))

function createIframeRef() {
	const iframe = document.createElement("iframe")
	Object.defineProperty(iframe, "contentWindow", {
		value: {
			postMessage: vi.fn((message: unknown) => {
				bridgeState.activationMessages.push(message)
			}),
		},
		configurable: true,
	})
	return { current: iframe }
}

interface TestHarnessProps {
	isEditMode: boolean
	iframeLoaded?: boolean
	contentInjected?: boolean
	renderSiteUrl?: string
	editorRef?: RefObject<HTMLEditorV2Ref>
}

function TestHarness({
	isEditMode,
	iframeLoaded = true,
	contentInjected = true,
	renderSiteUrl,
	editorRef,
}: TestHarnessProps) {
	const iframeRef = useRef(createIframeRef().current)
	const localEditorRef = useRef<HTMLEditorV2Ref>(null)

	useHTMLEditorV2({
		iframeRef,
		editorRef: editorRef ?? localEditorRef,
		isEditMode,
		sandboxType: "iframe",
		iframeLoaded,
		contentInjected,
		renderSiteUrl,
		targetOrigin: "*",
		filePathMapping: new Map(),
	})

	return null
}

describe("useHTMLEditorV2 edit lifecycle", () => {
	beforeEach(() => {
		bridgeState.instances.length = 0
		bridgeState.requests.length = 0
		bridgeState.activationMessages.length = 0
	})

	it("retries runtime activation until the iframe confirms readiness", async () => {
		vi.useFakeTimers()
		try {
			render(<TestHarness isEditMode />)

			await act(async () => {
				await Promise.resolve()
			})
			expect(bridgeState.activationMessages).toHaveLength(1)

			act(() => {
				vi.advanceTimersByTime(350)
			})
			expect(bridgeState.activationMessages).toHaveLength(2)

			act(() => {
				bridgeState.instances[0].emit("EDITOR_READY")
				vi.advanceTimersByTime(2_000)
			})
			expect(bridgeState.activationMessages).toHaveLength(2)
		} finally {
			vi.useRealTimers()
		}
	})

	it("re-enters edit and selection mode after cancelling edit without waiting for a second runtime ready event", async () => {
		const { rerender } = render(<TestHarness isEditMode />)

		await waitFor(() => expect(bridgeState.instances).toHaveLength(1))
		act(() => {
			bridgeState.instances[0].emit("EDITOR_READY")
		})

		await waitFor(() => {
			expect(bridgeState.requests).toEqual([
				EditorMessageType.ENTER_EDIT_MODE,
				EditorMessageType.ENTER_SELECTION_MODE,
			])
		})

		rerender(<TestHarness isEditMode={false} />)

		await waitFor(() => {
			expect(bridgeState.requests).toEqual([
				EditorMessageType.ENTER_EDIT_MODE,
				EditorMessageType.ENTER_SELECTION_MODE,
				EditorMessageType.EXIT_EDIT_MODE,
				EditorMessageType.EXIT_SELECTION_MODE,
			])
		})

		rerender(<TestHarness isEditMode />)

		await waitFor(() => {
			expect(bridgeState.requests).toEqual([
				EditorMessageType.ENTER_EDIT_MODE,
				EditorMessageType.ENTER_SELECTION_MODE,
				EditorMessageType.EXIT_EDIT_MODE,
				EditorMessageType.EXIT_SELECTION_MODE,
				EditorMessageType.ENTER_EDIT_MODE,
				EditorMessageType.ENTER_SELECTION_MODE,
			])
		})
	})

	it("keeps runtime ready when cross-domain ready arrives before content reinjection completes", async () => {
		const { rerender } = render(<TestHarness isEditMode renderSiteUrl="https://render.test" />)

		await waitFor(() => expect(bridgeState.instances).toHaveLength(1))
		act(() => {
			bridgeState.instances[0].emit("EDITOR_READY")
		})

		await waitFor(() => {
			expect(bridgeState.requests).toEqual([
				EditorMessageType.ENTER_EDIT_MODE,
				EditorMessageType.ENTER_SELECTION_MODE,
			])
		})

		rerender(
			<TestHarness
				isEditMode={false}
				contentInjected={false}
				renderSiteUrl="https://render.test"
			/>,
		)

		await waitFor(() => {
			expect(bridgeState.requests).toEqual([
				EditorMessageType.ENTER_EDIT_MODE,
				EditorMessageType.ENTER_SELECTION_MODE,
				EditorMessageType.EXIT_EDIT_MODE,
				EditorMessageType.EXIT_SELECTION_MODE,
			])
		})

		act(() => {
			bridgeState.instances[0].emit("EDITOR_READY")
		})

		rerender(<TestHarness isEditMode={false} renderSiteUrl="https://render.test" />)
		rerender(<TestHarness isEditMode renderSiteUrl="https://render.test" />)

		await waitFor(() => {
			expect(bridgeState.requests).toEqual([
				EditorMessageType.ENTER_EDIT_MODE,
				EditorMessageType.ENTER_SELECTION_MODE,
				EditorMessageType.EXIT_EDIT_MODE,
				EditorMessageType.EXIT_SELECTION_MODE,
				EditorMessageType.ENTER_EDIT_MODE,
				EditorMessageType.ENTER_SELECTION_MODE,
			])
		})
	})

	it("rejects batch preview commands after the editor bridge is destroyed", async () => {
		const editorRef = { current: null } as unknown as RefObject<HTMLEditorV2Ref>
		const { rerender } = render(<TestHarness isEditMode editorRef={editorRef} />)
		await waitFor(() => expect(editorRef.current?.beginBatchOperation).toBeTypeOf("function"))
		const editor = editorRef.current
		if (!editor) throw new Error("Editor ref was not initialized")

		rerender(<TestHarness isEditMode iframeLoaded={false} editorRef={editorRef} />)

		await expect(editor.beginBatchOperation(".slide", { padding: "16px" })).rejects.toThrow(
			"HTML editor bridge is unavailable",
		)
		await expect(editor.applyStylesTemporary(".slide", { padding: "16px" })).rejects.toThrow(
			"HTML editor bridge is unavailable",
		)
	})

	it("returns the iframe layout from applyStylesTemporary", async () => {
		const editorRef = { current: null } as unknown as RefObject<HTMLEditorV2Ref>
		const layout = {
			rect: { top: 80, left: 0, width: 220, height: 216 },
			childRects: [
				{ top: 80, left: 10, width: 80, height: 80 },
				{ top: 196, left: 10, width: 80, height: 80 },
			],
		}
		render(<TestHarness isEditMode editorRef={editorRef} />)
		await waitFor(() => expect(bridgeState.instances).toHaveLength(1))
		bridgeState.instances[0].sendCommand.mockResolvedValue(layout)

		await waitFor(() => expect(editorRef.current?.applyStylesTemporary).toBeTypeOf("function"))
		const editor = editorRef.current
		if (!editor) throw new Error("Editor ref was not initialized")
		await expect(
			editor.applyStylesTemporary("div.meta-grid", { rowGap: "36px" }),
		).resolves.toEqual(layout)
	})
})
