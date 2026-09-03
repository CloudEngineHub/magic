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
	it("只读时保留搜索和刷新，隐藏所有写操作入口", () => {
		render(
			<NormalModeHeader
				isShareRoute={false}
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
