import { act, fireEvent, render, waitFor } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import MagicMarkmap from "../index"

const markmapFitMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockSize = vi.hoisted(() => ({
	value: { width: 800, height: 600 } as { width: number; height: number },
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("ahooks", async () => {
	const React = await import("react")
	const actual = await vi.importActual<typeof import("ahooks")>("ahooks")
	return {
		...actual,
		useSize: () => mockSize.value,
		useDebounceEffect: (effect: () => void, deps: unknown[]) =>
			// eslint-disable-next-line react-hooks/exhaustive-deps -- test mock runs debounced resize immediately
			React.useEffect(() => {
				effect()
			}, deps),
	}
})

vi.mock("markmap-toolbar/dist/style.css", () => ({}))

vi.mock("../components/ExportPPTButton", () => ({
	default: () => null,
}))

vi.mock("../../MagicModal", () => ({
	default: () => null,
}))

vi.mock("../../MagicButton", () => ({
	default: () => null,
}))

vi.mock("../../MagicIcon", () => ({
	default: () => null,
}))

vi.mock("@/components/other/Divider", () => ({
	default: () => null,
}))

vi.mock("antd", () => ({
	Flex: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	Switch: () => null,
	Typography: {
		Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
	},
}))

vi.mock("markmap-view", () => ({
	Markmap: {
		create: () => ({
			setData: vi.fn().mockResolvedValue(undefined),
			fit: markmapFitMock,
			destroy: vi.fn(),
			setOptions: vi.fn(),
		}),
	},
}))

vi.mock("../markmap", () => ({
	ensureMarkmapInitialized: vi.fn().mockResolvedValue(undefined),
	transformer: {
		transform: () => ({ root: { content: "mock-root" } }),
	},
}))

const sampleMarkdown = "# Root\n\n## Branch"

/** Bumps a prop so memoized MagicMarkmap re-renders after the mocked size changes. */
function MarkmapResizeHost() {
	const [version, setVersion] = useState(0)
	const content = version === 0 ? sampleMarkdown : `${sampleMarkdown}\n\n## Resize`

	return (
		<div style={{ width: 800, height: 600 }}>
			<MagicMarkmap data={content} showToolBar={false} fullScreen className="!h-full" />
			<button type="button" data-testid="trigger-resize" onClick={() => setVersion(1)}>
				resize
			</button>
		</div>
	)
}

describe("MagicMarkmap resize", () => {
	beforeEach(() => {
		markmapFitMock.mockClear()
		mockSize.value = { width: 800, height: 600 }
	})

	it("refits the markmap when the observed container size changes", async () => {
		const { getByTestId } = render(<MarkmapResizeHost />)

		await waitFor(() => {
			expect(markmapFitMock).toHaveBeenCalled()
		})

		markmapFitMock.mockClear()
		mockSize.value = { width: 1200, height: 800 }

		await act(async () => {
			fireEvent.click(getByTestId("trigger-resize"))
		})

		await waitFor(() => {
			expect(markmapFitMock).toHaveBeenCalled()
		})
	})
})
