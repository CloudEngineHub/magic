import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CanvasDesignStorageData } from "../../../../public/magic-types"
import { TooltipProvider } from "../../../primitives/shadcn/tooltip"
import ViewportControls from "../index"

const execute = vi.fn()
const saveStorage = vi.fn((data: CanvasDesignStorageData) => {
	mockStorage = data
})
let mockStorage: CanvasDesignStorageData = {}

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({
		canvas: {
			viewportController: {
				getScale: () => 1,
				getFitToScreenScale: () => 1,
				setScale: vi.fn(),
			},
			userActionRegistry: { execute },
		},
	}),
}))

vi.mock("../../../../app/hooks/canvas", () => ({
	useCanvasEvent: vi.fn(),
}))

vi.mock("../../../../app/providers/MagicProvider", () => ({
	useMagic: () => ({
		methods: {
			getStorage: () => mockStorage,
			saveStorage,
		},
	}),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({
		t: (key: string, fallbackOrOptions?: string | { defaultValue?: string }) => {
			if (typeof fallbackOrOptions === "string") return fallbackOrOptions
			return fallbackOrOptions?.defaultValue ?? key
		},
	}),
}))

vi.mock("../../minimap/MinimapPanel", () => ({
	default: ({ id }: { id: string }) => <div id={id} role="region" aria-label="小地图" />,
}))

function renderViewportControls() {
	return render(
		<TooltipProvider>
			<ViewportControls />
		</TooltipProvider>,
	)
}

describe("ViewportControls minimap shell", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockStorage = {}
	})

	it("toggles the empty minimap panel and active state", () => {
		renderViewportControls()

		const toggle = screen.getByRole("button", { name: "小地图" })
		expect(toggle).not.toHaveAttribute("title")
		expect(toggle).toHaveAttribute("aria-pressed", "false")
		expect(screen.queryByRole("region", { name: "小地图" })).not.toBeInTheDocument()

		fireEvent.click(toggle)

		expect(toggle).toHaveAttribute("aria-pressed", "true")
		expect(screen.getByRole("region", { name: "小地图" })).toBeInTheDocument()
		expect(saveStorage).toHaveBeenLastCalledWith({ minimapOpen: true })

		fireEvent.click(toggle)

		expect(toggle).toHaveAttribute("aria-pressed", "false")
		expect(screen.queryByRole("region", { name: "小地图" })).not.toBeInTheDocument()
		expect(saveStorage).toHaveBeenLastCalledWith({ minimapOpen: false })
	})

	it("restores the cached open state without rewriting storage on mount", () => {
		mockStorage = { minimapOpen: true }

		renderViewportControls()

		expect(screen.getByRole("button", { name: "小地图" })).toHaveAttribute(
			"aria-pressed",
			"true",
		)
		expect(screen.getByRole("region", { name: "小地图" })).toBeInTheDocument()
		expect(saveStorage).not.toHaveBeenCalled()
	})

	it("preserves existing project storage when persisting the toggle", () => {
		mockStorage = {
			viewport: { scale: 0.5, x: 120, y: 80 },
			layersCollapsed: true,
			expandedElementIds: ["frame-1"],
		}

		renderViewportControls()
		fireEvent.click(screen.getByRole("button", { name: "小地图" }))

		expect(saveStorage).toHaveBeenLastCalledWith({
			viewport: { scale: 0.5, x: 120, y: 80 },
			layersCollapsed: true,
			expandedElementIds: ["frame-1"],
			minimapOpen: true,
		})
	})
})
