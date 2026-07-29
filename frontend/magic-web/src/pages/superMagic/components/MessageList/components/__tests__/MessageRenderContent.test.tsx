import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MessageRenderContent from "../MessageRenderContent"
import MessageRenderErrorBoundary from "../MessageRenderErrorBoundary"

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	}
})

describe("MessageRenderContent", () => {
	it("lets the parent error boundary catch a synchronous render error", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

		try {
			const { container } = render(
				<MessageRenderErrorBoundary messageKey="message-1">
					<MessageRenderContent
						render={() => {
							throw new Error("message render failed")
						}}
					/>
				</MessageRenderErrorBoundary>,
			)

			expect(container.querySelector('[data-testid="message-render-error"]')).not.toBeNull()
		} finally {
			consoleError.mockRestore()
		}
	})
})
