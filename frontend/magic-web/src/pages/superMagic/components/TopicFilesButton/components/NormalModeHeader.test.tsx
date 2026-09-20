import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import NormalModeHeader from "./NormalModeHeader"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("./FileMenuDropdown", () => ({
	default: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("./UploadMenuDropdown", () => ({
	default: ({ children }: { children: React.ReactNode }) => children,
}))

describe("NormalModeHeader", () => {
	it("uses the shared project panel header padding and title style", () => {
		render(
			<NormalModeHeader
				title="项目文件"
				showRefresh
				refreshLoading={false}
				allowEdit={false}
				onRefresh={vi.fn()}
			/>,
		)

		const header = screen.getByText("项目文件").closest("[data-slot='project-panel-header']")
		expect(header).toHaveClass("h-8", "px-2")
		expect(
			screen.getByText("项目文件").closest("[data-slot='project-panel-title']"),
		).toHaveClass("text-[13px]", "font-medium")
	})

	it("只读时保留搜索和刷新，隐藏所有写操作入口", () => {
		render(
			<NormalModeHeader
				showRefresh
				refreshLoading={false}
				allowEdit={false}
				onRefresh={vi.fn()}
				onSearch={vi.fn()}
				onAddFile={vi.fn()}
				onAddFolder={vi.fn()}
				onUploadFile={vi.fn()}
				onUploadFolder={vi.fn()}
				onEnterSelectMode={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("file-header-search-button")).toBeInTheDocument()
		expect(screen.getByTestId("file-header-refresh-button")).toBeInTheDocument()
		expect(screen.queryByTestId("file-header-add-file-button")).not.toBeInTheDocument()
		expect(screen.queryByTestId("file-header-add-folder-button")).not.toBeInTheDocument()
		expect(screen.queryByTestId("file-header-upload-button")).not.toBeInTheDocument()
		expect(screen.queryByTestId("file-header-select-mode-button")).not.toBeInTheDocument()
	})
})
