import { act, fireEvent, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import SecondEdit from "../SecondEdit"
import { MediaEditRecoveryManager } from "../../../../runtime/interaction/media-edit-recovery/MediaEditRecoveryManager"

const mocks = vi.hoisted(() => ({
	isReplacing: true,
	isLoadingImageModelList: false,
	registration: null as null | { visible?: boolean },
	restoreQuickEditConfigToUi: vi.fn(),
	restoreOriginalGenerateImageRequestToUi: vi.fn(),
	restoreSnapshotToUi: vi.fn(),
	snapshot: { request: { model_id: "image-model", prompt: "prompt" } } as {
		request: { model_id: string; prompt: string }
	},
	canvas: null as null | { mediaEditRecoveryManager: MediaEditRecoveryManager },
	surfaceProps: null as null | Record<string, unknown>,
}))

vi.mock("../../../../app/providers/CanvasUIProvider", () => ({
	useCanvasUI: () => ({ selectedElements: [{ type: "image", id: "image-1" }] }),
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({
		canvas: mocks.canvas,
	}),
}))

vi.mock("../../../../app/providers/MagicProvider", () => ({
	useMagic: () => ({
		imageModelList: [],
		isLoadingImageModelList: mocks.isLoadingImageModelList,
		methods: {},
	}),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({ t: (_key: string, fallback: string) => fallback }),
}))

vi.mock("../../../../app/hooks/canvas", () => ({
	useCanvasEvent: vi.fn(),
	useIsMediaReplacing: () => mocks.isReplacing,
}))

vi.mock("../../../../runtime/elements/core/ContentVersionOperations", () => ({}))

vi.mock("../../../../runtime/document/elementContent", async () => {
	const actual = await vi.importActual<
		typeof import("../../../../runtime/document/elementContent")
	>("../../../../runtime/document/elementContent")
	return actual
})

vi.mock("../../../../app/hooks/resources/useImageOssSrc", () => ({
	useImageOssSrc: () => ({ hasOssSrc: true }),
}))

vi.mock("../useImageEditorConfig", () => ({
	useImageEditorConfig: () => ({
		prompt: "prompt",
		restoreRevision: 1,
		hasRestoredRef: { current: true },
		isRestoringRef: { current: false },
		handlers: {
			restoreQuickEditConfigToUi: mocks.restoreQuickEditConfigToUi,
			restoreOriginalGenerateImageRequestToUi: mocks.restoreOriginalGenerateImageRequestToUi,
			setPrompt: vi.fn(),
			buildRequestParams: () => ({ model_id: "image-model", prompt: "prompt" }),
		},
		editSession: {
			buildSnapshot: () => mocks.snapshot,
			restoreSnapshotToUi: mocks.restoreSnapshotToUi,
		},
	}),
}))

vi.mock("../../../canvas-editor/element-bottom-toolbar/ElementBottomToolbarContext", () => ({
	useElementBottomToolbarSection: (registration: { visible?: boolean }) => {
		mocks.registration = registration
	},
}))

vi.mock("../../../canvas-editor/element-bottom-toolbar/ElementVersionToolbarSection", () => ({
	useElementVersionToolbarSection: (_element: unknown, visible?: boolean) => {
		if (visible === false) mocks.registration = { visible: false }
	},
}))

vi.mock("../ImageEditorSurface", () => ({
	default: (props: Record<string, unknown>) => {
		mocks.surfaceProps = props
		return null
	},
}))

const imageElement = {
	id: "image-1",
	type: "image",
	name: "image",
	contents: [
		{
			contentId: "image-content-1",
			src: "/images/current.png",
			status: "completed",
			generateImageRequest: { model_id: "image-model", prompt: "prompt" },
		},
	],
	activeContentId: "image-content-1",
	mainContentId: "image-content-1",
	width: 100,
	height: 100,
} as never

describe("SecondEdit replacement guard", () => {
	beforeEach(() => {
		mocks.isReplacing = true
		mocks.isLoadingImageModelList = false
		mocks.registration = null
		mocks.restoreQuickEditConfigToUi.mockReset()
		mocks.restoreOriginalGenerateImageRequestToUi.mockReset()
		mocks.restoreSnapshotToUi.mockReset()
		mocks.snapshot = { request: { model_id: "image-model", prompt: "prompt" } }
		mocks.surfaceProps = null
		mocks.canvas = {
			mediaEditRecoveryManager: new MediaEditRecoveryManager(),
			mediaReplaceController: { isReplacing: () => mocks.isReplacing },
			elementManager: { getElementInstance: vi.fn() },
		} as typeof mocks.canvas
	})

	it("removes result actions and ignores Tab while replacing", () => {
		render(
			<SecondEdit
				imageElement={imageElement}
				onPreviewMediaResource={vi.fn()}
				isMediaResourcePreviewOpen={false}
			/>,
		)

		expect(mocks.registration).toMatchObject({ visible: false })
		act(() => {
			fireEvent.keyDown(window, { key: "Tab", shiftKey: false })
		})
		expect(mocks.restoreQuickEditConfigToUi).not.toHaveBeenCalled()
	})

	it("reopens the same intent with an interrupted draft and can restore its baseline", async () => {
		mocks.isReplacing = false
		const sessionStore = mocks.canvas?.mediaEditRecoveryManager as
			MediaEditRecoveryManager | undefined
		if (!sessionStore) return
		const sessionKey = {
			elementId: "image-1",
			contentId: "image-content-1",
			intent: "quick-edit" as const,
		}
		const sourceFingerprint = "image-content-1:/images/current.png"
		const initialSnapshot = { request: { model_id: "image-model", prompt: "prompt" } }
		const interruptedSnapshot = {
			request: { model_id: "image-model", prompt: "changed prompt" },
		}

		const first = render(<SecondEdit imageElement={imageElement} />)
		const quickEditAction = (
			mocks.registration as { items: Array<{ id: string; onClick: () => void }> }
		).items.find((item) => item.id === "quick-edit")
		expect(quickEditAction).toBeDefined()
		act(() => quickEditAction?.onClick())
		await waitFor(() => {
			expect(sessionStore.get(sessionKey, sourceFingerprint)?.baseline).toEqual(
				initialSnapshot,
			)
		})

		mocks.snapshot = interruptedSnapshot
		first.unmount()
		expect(sessionStore.get(sessionKey, sourceFingerprint)?.draft).toEqual(interruptedSnapshot)

		render(<SecondEdit imageElement={imageElement} />)
		const resumedQuickEditAction = (
			mocks.registration as { items: Array<{ id: string; onClick: () => void }> }
		).items.find((item) => item.id === "quick-edit")
		act(() => resumedQuickEditAction?.onClick())
		await waitFor(() => {
			expect(mocks.restoreSnapshotToUi).toHaveBeenCalledWith(interruptedSnapshot)
			expect(mocks.surfaceProps?.showRestoreDefaultConfig).toBe(true)
		})

		act(() => (mocks.surfaceProps?.onRestoreDefaultConfig as () => void)())
		expect(mocks.restoreSnapshotToUi).toHaveBeenLastCalledWith(initialSnapshot)
		expect(sessionStore.get(sessionKey, sourceFingerprint)?.draft).toEqual(initialSnapshot)
	})

	it("waits for image models before consuming an edit entry", async () => {
		mocks.isReplacing = false
		mocks.isLoadingImageModelList = true
		const view = render(<SecondEdit imageElement={imageElement} />)
		const quickEditAction = (
			mocks.registration as { items: Array<{ id: string; onClick: () => void }> }
		).items.find((item) => item.id === "quick-edit")

		act(() => quickEditAction?.onClick())
		expect(mocks.restoreQuickEditConfigToUi).not.toHaveBeenCalled()
		expect(mocks.surfaceProps).toBeNull()

		mocks.isLoadingImageModelList = false
		view.rerender(<SecondEdit imageElement={imageElement} />)
		await waitFor(() => expect(mocks.restoreQuickEditConfigToUi).toHaveBeenCalledOnce())
	})
})
