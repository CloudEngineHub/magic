import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import DesignStyleRawPreview from "../DesignStyleRawPreview"
import { clearDesignStyleSourceCache } from "../useDesignStyleSource"
import { designStyleFixture } from "./fixtures"

const getSource = vi.hoisted(() => vi.fn())

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { code?: string }) =>
			options?.code ? `${key}:${options.code}` : key,
	}),
}))

vi.mock("@/apis", () => ({
	HtmlDesignStylesApi: {
		getSource: (...args: unknown[]) => getSource(...args),
	},
}))

vi.mock("@/utils/env", () => ({ isDev: false }))

vi.mock("../copyToClipboard", () => ({
	copyToClipboard: vi.fn(async () => true),
}))

describe("DesignStyleRawPreview", () => {
	beforeEach(() => {
		getSource.mockReset()
		clearDesignStyleSourceCache()
	})

	it("renders the raw DESIGN.md content returned by the API", async () => {
		getSource.mockResolvedValue({
			style_code: designStyleFixture.code,
			content: "# Fixture Style\n\nRaw body.",
			sha256: "abc123",
		})

		render(<DesignStyleRawPreview style={designStyleFixture} active />)

		await waitFor(() =>
			expect(screen.getByTestId("design-style-raw-content")).toHaveTextContent("Raw body."),
		)
		expect(getSource).toHaveBeenCalledWith({ styleCode: designStyleFixture.code })
		expect(screen.getByText(/sha256: abc123/)).toBeInTheDocument()
	})

	it("shows an error state and retries on demand", async () => {
		getSource.mockRejectedValueOnce(new ArrayBuffer(8)).mockResolvedValueOnce({
			style_code: designStyleFixture.code,
			content: "# Recovered",
			sha256: "def456",
		})

		render(<DesignStyleRawPreview style={designStyleFixture} active />)

		await waitFor(() =>
			expect(screen.getByTestId("design-style-raw-error")).toBeInTheDocument(),
		)
		expect(screen.getByTestId("design-style-raw-error")).not.toHaveTextContent(
			"[object ArrayBuffer]",
		)

		fireEvent.click(screen.getByTestId("design-style-raw-retry"))

		await waitFor(() =>
			expect(screen.getByTestId("design-style-raw-content")).toHaveTextContent("# Recovered"),
		)
	})

	it("does not request the source when inactive", () => {
		render(<DesignStyleRawPreview style={designStyleFixture} active={false} />)

		expect(getSource).not.toHaveBeenCalled()
	})
})
