import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MobileRecordingListToolbar } from "../MobileRecordingListToolbar"

/** Provides deterministic toolbar translations without initializing the application i18n runtime. */
vi.mock("react-i18next", () => ({
	/** Returns the requested key so the test only exercises toolbar layout behavior. */
	useTranslation: () => ({
		/** Preserves literal translation keys as stable test labels. */
		t: (key: string) => key,
	}),
}))

describe("MobileRecordingListToolbar", () => {
	/** Verifies that a long fictional group name yields space to the fixed toolbar actions. */
	it("truncates long group names without shrinking the action area", () => {
		const longGroupName = "示例移动端项目讨论分组名称用于验证超长文本布局"

		render(
			<MobileRecordingListToolbar
				groupLabel={longGroupName}
				groupCount={12}
				activeFilterCount={0}
				searchOpen={false}
				searchKeyword=""
				onSearchKeywordChange={vi.fn()}
				onOpenSearch={vi.fn()}
				onDismissSearch={vi.fn()}
				onOpenGroupSheet={vi.fn()}
				onOpenFilterSheet={vi.fn()}
				onOpenImportSheet={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("mobile-recording-group-trigger")).toHaveClass(
			"min-w-0",
			"flex-1",
			"overflow-hidden",
		)
		expect(screen.getByText(longGroupName)).toHaveClass("min-w-0", "truncate")
		expect(screen.getByTestId("mobile-recording-toolbar-actions")).toHaveClass("shrink-0")
	})
})
