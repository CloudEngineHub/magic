import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ImageElement } from "../../../../runtime/document/types"
import ElementVersionControls from "../ElementVersionControls"

const mocks = vi.hoisted(() => ({
	operations: {
		switchActiveContent: vi.fn(),
		setMainContent: vi.fn(),
		deleteActiveContent: vi.fn(),
	},
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({
		canvas: {
			elementManager: {
				getElementInstance: () => mocks.operations,
			},
		},
	}),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({
		t: (key: string, fallback?: string | { defaultValue?: string }) =>
			typeof fallback === "string" ? fallback : (fallback?.defaultValue ?? key),
	}),
}))

function createImageElement(overrides: Partial<ImageElement> = {}): ImageElement {
	return {
		id: "image-1",
		type: "image",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		activeContentId: "version-2",
		mainContentId: "version-1",
		contents: [
			{ contentId: "version-1", src: "one.png", status: "completed" },
			{ contentId: "version-2", src: "two.png", status: "completed" },
		],
		...overrides,
	}
}

describe("ElementVersionControls", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("delegates version actions to the element instance", () => {
		render(<ElementVersionControls element={createImageElement()} />)

		fireEvent.click(screen.getByRole("button", { name: "上一个版本" }))
		fireEvent.click(screen.getByRole("button", { name: "设为主版本" }))
		fireEvent.click(screen.getByRole("button", { name: "删除版本" }))

		expect(mocks.operations.switchActiveContent).toHaveBeenCalledWith("version-1")
		expect(mocks.operations.setMainContent).toHaveBeenCalledWith("version-2")
		expect(mocks.operations.deleteActiveContent).toHaveBeenCalledTimes(1)
	})

	it("disables deletion for a pending image version", () => {
		render(
			<ElementVersionControls
				element={createImageElement({
					contents: [
						{ contentId: "version-1", src: "one.png", status: "completed" },
						{ contentId: "version-2", status: "pending" },
					],
				})}
			/>,
		)

		expect(screen.getByRole("button", { name: "删除版本" })).toBeDisabled()
	})
})
