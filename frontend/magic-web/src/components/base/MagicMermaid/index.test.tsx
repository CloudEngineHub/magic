import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useOverlayZIndex } from "@/hooks/useOverlayZIndex"
import MagicMermaid from "."

const releaseOverlayZIndex = vi.fn()

vi.mock("antd", () => ({
	Flex: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	Spin: () => <div data-testid="antd-spin" />,
}))

vi.mock("@/hooks/useOverlayZIndex", () => ({
	useOverlayZIndex: vi.fn(() => ({
		overlayZIndex: 1200,
		contentZIndex: 1201,
		releaseOverlayZIndex,
	})),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("../Mermaid", () => ({
	Mermaid: ({ onClick }: { onClick?: React.MouseEventHandler<HTMLDivElement> }) => (
		<div data-testid="mermaid-diagram" onClick={onClick}>
			<svg viewBox="0 0 100 50" />
		</div>
	),
}))

vi.mock("@/services/other/MermaidRenderService", () => ({
	default: {
		fix: (data: string) => data,
	},
}))

vi.mock("@/components/base/MagicImagePreview", () => ({
	default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/base/MagicSegmented", () => ({
	default: () => <div data-testid="magic-segmented" />,
}))

vi.mock("@/components/base/MagicCode", () => ({
	default: () => <div data-testid="magic-code" />,
}))

describe("MagicMermaid preview layering", () => {
	beforeEach(() => {
		releaseOverlayZIndex.mockClear()
	})

	it("renders the preview overlay above mobile file preview layers", async () => {
		render(<MagicMermaid data="flowchart TD\nA --> B" allowPreview />)

		fireEvent.click(await screen.findByTestId("mermaid-diagram"))

		await waitFor(() => {
			const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')
			const content = document.querySelector<HTMLElement>('[data-slot="dialog-content"]')

			expect(overlay?.style.zIndex).toBe("1201")
			expect(content?.style.zIndex).toBe("1201")
			expect(Number(content?.style.zIndex)).toBeGreaterThan(1101)
			expect(useOverlayZIndex).toHaveBeenLastCalledWith({ open: true, zIndex: 1200 })
		})
	})
})
