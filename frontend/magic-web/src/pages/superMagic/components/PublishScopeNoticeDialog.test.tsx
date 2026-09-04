import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PublishScopeNoticeDialog from "./PublishScopeNoticeDialog"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("PublishScopeNoticeDialog", () => {
	it("shows the publish path and allows continuing or cancelling", () => {
		const onContinue = vi.fn()
		const onCancel = vi.fn()

		const { rerender } = render(
			<PublishScopeNoticeDialog
				open
				publishPath=".magic/skills/demo"
				outsidePaths={["README.md", "src/index.ts", "assets/logo.svg", "docs/guide.md"]}
				onContinue={onContinue}
				onCancel={onCancel}
			/>,
		)

		expect(screen.getByTestId("publish-scope-notice-dialog")).toHaveTextContent(
			"publishScopeNotice.intro",
		)
		expect(screen.getByTestId("publish-scope-notice-dialog")).toHaveTextContent(
			".magic/skills/demo",
		)
		expect(screen.getByTestId("publish-scope-notice-dialog")).toHaveTextContent("README.md")
		expect(screen.getByTestId("publish-scope-notice-dialog")).toHaveTextContent("src/index.ts")
		expect(screen.getByTestId("publish-scope-notice-dialog")).toHaveTextContent(
			"assets/logo.svg",
		)
		expect(screen.getByTestId("publish-scope-notice-dialog")).not.toHaveTextContent(
			"docs/guide.md",
		)
		expect(screen.getByTestId("publish-scope-notice-dialog")).toHaveTextContent(
			"publishScopeNotice.morePaths",
		)

		fireEvent.click(screen.getByRole("button", { name: "publishScopeNotice.continue" }))
		expect(onContinue).toHaveBeenCalledTimes(1)

		rerender(
			<PublishScopeNoticeDialog
				open
				publishPath=".magic/skills/demo"
				outsidePaths={[]}
				onContinue={onContinue}
				onCancel={onCancel}
			/>,
		)
		fireEvent.click(screen.getByRole("button", { name: "publishScopeNotice.cancel" }))
		expect(onCancel).toHaveBeenCalledTimes(1)
	})
})
