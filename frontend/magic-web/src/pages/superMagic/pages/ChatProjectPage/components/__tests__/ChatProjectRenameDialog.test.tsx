import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChatProjectRenameDialog } from "../ChatProjectRenameDialog"

const { mockShouldSuppressAutoFocus } = vi.hoisted(() => ({
	mockShouldSuppressAutoFocus: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	__esModule: true,
	default: {
		success: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services", () => ({
	__esModule: true,
	default: {
		project: {
			renameProject: vi.fn(),
		},
	},
}))

vi.mock("@/utils/inputFocusPolicy", () => ({
	shouldSuppressInputAutoFocusInMagicApp: mockShouldSuppressAutoFocus,
}))

const mockProject = {
	id: "project-mock",
	workspace_id: "workspace-mock",
	project_name: "Mock chat",
} as never

/**
 * Render the chat rename dialog in its open state so input focus attributes are mounted.
 */
function renderRenameDialog() {
	return render(
		<ChatProjectRenameDialog
			open
			onOpenChange={vi.fn()}
			project={mockProject}
			selectedTopic={null}
		/>,
	)
}

describe("ChatProjectRenameDialog auto focus policy", () => {
	beforeEach(() => {
		mockShouldSuppressAutoFocus.mockReset()
		mockShouldSuppressAutoFocus.mockReturnValue(false)
	})

	it("keeps auto focus outside Magic App", async () => {
		renderRenameDialog()

		const input = screen.getByTestId("chat-project-rename-input")

		await waitFor(() => {
			expect(document.activeElement).toBe(input)
		})
	})

	it("suppresses auto focus inside Magic App WebView", () => {
		mockShouldSuppressAutoFocus.mockReturnValue(true)

		renderRenameDialog()

		expect(document.activeElement).not.toBe(screen.getByTestId("chat-project-rename-input"))
	})
})
