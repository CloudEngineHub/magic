import { act, fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import SecondEdit from "../SecondEdit"

const mocks = vi.hoisted(() => ({
	isReplacing: true,
	registration: null as null | { visible?: boolean },
	restoreQuickEditConfigToUi: vi.fn(),
	restoreOriginalGenerateImageRequestToUi: vi.fn(),
}))

vi.mock("../../../../app/providers/CanvasUIProvider", () => ({
	useCanvasUI: () => ({ selectedElements: [{ type: "image", id: "image-1" }] }),
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({
		canvas: {
			mediaReplaceController: { isReplacing: () => mocks.isReplacing },
			elementManager: { getElementInstance: vi.fn() },
		},
	}),
}))

vi.mock("../../../../app/providers/MagicProvider", () => ({
	useMagic: () => ({ imageModelList: [], methods: {} }),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({ t: (_key: string, fallback: string) => fallback }),
}))

vi.mock("../../../../app/hooks/canvas", () => ({
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
		handlers: {
			restoreQuickEditConfigToUi: mocks.restoreQuickEditConfigToUi,
			restoreOriginalGenerateImageRequestToUi: mocks.restoreOriginalGenerateImageRequestToUi,
			setPrompt: vi.fn(),
			buildRequestParams: () => ({ model_id: "image-model", prompt: "prompt" }),
		},
	}),
}))

vi.mock("../../../canvas-editor/element-bottom-toolbar/ElementBottomToolbarContext", () => ({
	useElementBottomToolbarSection: (registration: { visible?: boolean }) => {
		mocks.registration = registration
	},
}))

vi.mock("../ImageEditorSurface", () => ({
	default: () => null,
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
		mocks.registration = null
		mocks.restoreQuickEditConfigToUi.mockReset()
		mocks.restoreOriginalGenerateImageRequestToUi.mockReset()
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
})
