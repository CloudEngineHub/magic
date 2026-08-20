import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import VideoSecondEdit from "../VideoSecondEdit"
import { MediaEditRecoveryManager } from "../../../../runtime/interaction/media-edit-recovery/MediaEditRecoveryManager"

const mocks = vi.hoisted(() => ({
	registration: null as null | { items: Array<{ id: string; onClick: () => void }> },
	renderProps: null as null | Record<string, unknown>,
	isReplacing: false,
	canvas: null as null | { mediaEditRecoveryManager: MediaEditRecoveryManager },
}))

vi.mock("../../../../app/providers/CanvasUIProvider", () => ({
	useCanvasUI: () => ({ selectedElements: [{ type: "video", id: "video-1" }] }),
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({ canvas: mocks.canvas }),
}))

vi.mock("../../../../app/providers/MagicProvider", () => ({
	useMagic: () => ({
		methods: {},
		videoModelList: [{ model_id: "video-model" }],
		getCachedVideoPointsEstimate: vi.fn(),
		getVideoPointsEstimate: vi.fn(),
	}),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({ t: (_key: string, fallback: string) => fallback }),
}))

vi.mock("../../../../app/hooks/canvas", () => ({
	useIsMediaReplacing: () => mocks.isReplacing,
}))

vi.mock("../useVideoPointsConfirm", () => ({
	useVideoPointsConfirm: () => vi.fn(),
}))

vi.mock("../model-config/video-editor-config.model", async () => {
	const actual = await vi.importActual<
		typeof import("../model-config/video-editor-config.model")
	>("../model-config/video-editor-config.model")
	return {
		...actual,
		resolveVideoReferenceVideoModel: vi.fn(() => ({
			model: { model_id: "video-model" },
			inputMode: "standard",
		})),
	}
})

vi.mock("../../../canvas-editor/element-bottom-toolbar/ElementBottomToolbarContext", () => ({
	useElementBottomToolbarSection: (registration: typeof mocks.registration) => {
		mocks.registration = registration
	},
}))

vi.mock("../VideoGenerateEditorRender", () => ({
	default: (props: Record<string, unknown>) => {
		mocks.renderProps = props
		return null
	},
}))

const videoElement = {
	id: "video-1",
	type: "video",
	contents: [
		{
			contentId: "video-content-1",
			src: "/videos/current.mp4",
			status: "completed",
			generateVideoRequest: { model_id: "video-model", prompt: "saved" },
		},
	],
	activeContentId: "video-content-1",
	mainContentId: "video-content-1",
} as never

describe("VideoSecondEdit session routing", () => {
	beforeEach(() => {
		mocks.registration = null
		mocks.renderProps = null
		mocks.isReplacing = false
		mocks.canvas = {
			mediaEditRecoveryManager: new MediaEditRecoveryManager(),
			mediaReplaceController: { isReplacing: () => mocks.isReplacing },
			elementManager: {
				getElementInstance: vi.fn(),
				getElementData: vi.fn(() => videoElement),
			},
		} as typeof mocks.canvas
	})

	it("restores the session for the selected intent without crossing quick-edit and re-edit", async () => {
		const store = mocks.canvas?.mediaEditRecoveryManager as MediaEditRecoveryManager | undefined
		if (!store) return
		const sourceFingerprint = "video-content-1:/videos/current.mp4"
		const quickSnapshot = {
			request: { model_id: "video-model", prompt: "quick" },
			modeDrafts: {
				first_last_frame: {
					prompt: "quick frame prompt",
					activeInputTab: "frame",
					frameImageInfos: [{ path: "/images/start.png" }],
					referenceImageInfos: [],
				},
			},
		}
		const reEditSnapshot = {
			request: { model_id: "video-model", prompt: "saved edit" },
			modeDrafts: {},
		}
		store.set(
			{ elementId: "video-1", contentId: "video-content-1", intent: "quick-edit" },
			sourceFingerprint,
			quickSnapshot,
			quickSnapshot,
		)
		store.set(
			{ elementId: "video-1", contentId: "video-content-1", intent: "re-edit" },
			sourceFingerprint,
			reEditSnapshot,
			reEditSnapshot,
		)

		render(<VideoSecondEdit videoElement={videoElement} />)
		const quickAction = mocks.registration?.items.find((item) => item.id === "quick-edit")
		act(() => quickAction?.onClick())
		await waitFor(() => expect(mocks.renderProps?.sessionSnapshot).toEqual(quickSnapshot))
		expect(mocks.renderProps?.sessionIntent).toBe("quick-edit")

		const reEditAction = mocks.registration?.items.find((item) => item.id === "re-edit")
		act(() => reEditAction?.onClick())
		await waitFor(() => expect(mocks.renderProps?.sessionSnapshot).toEqual(reEditSnapshot))
		expect(mocks.renderProps?.sessionIntent).toBe("re-edit")
	})

	it("does not restore an interrupted session after the active media source changes", async () => {
		mocks.canvas?.mediaEditRecoveryManager.set(
			{ elementId: "video-1", contentId: "video-content-1", intent: "quick-edit" },
			"video-content-1:/videos/current.mp4",
			{ request: { model_id: "video-model", prompt: "old" }, modeDrafts: {} },
		)

		const view = render(<VideoSecondEdit videoElement={videoElement} />)
		const changedVideoElement = {
			...videoElement,
			contents: [{ ...videoElement.contents[0], src: "/videos/replaced.mp4" }],
		} as never
		view.rerender(<VideoSecondEdit videoElement={changedVideoElement} />)

		await waitFor(() => {
			expect(
				mocks.canvas?.mediaEditRecoveryManager.get(
					{ elementId: "video-1", contentId: "video-content-1", intent: "quick-edit" },
					"video-content-1:/videos/replaced.mp4",
				),
			).toBeNull()
		})
	})
})
