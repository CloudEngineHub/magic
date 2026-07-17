import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DevConsolePanel } from "../DevConsolePanel"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/shadcn-ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("../ConsoleTab", () => ({ ConsoleTab: () => <div /> }))
vi.mock("../NetworkTab", () => ({ NetworkTab: () => <div /> }))
vi.mock("../ApiTab", () => ({ ApiTab: () => <div /> }))
vi.mock("../MessagesTab", () => ({ MessagesTab: () => <div /> }))
vi.mock("../StorageTab", () => ({ StorageTab: () => <div /> }))
vi.mock("../SourcesTab", () => ({ SourcesTab: () => <div /> }))
vi.mock("../DependenciesTab", () => ({ DependenciesTab: () => <div /> }))
vi.mock("../OnboardingDialog", () => ({ OnboardingDialog: () => null }))

describe("DevConsolePanel layout menu", () => {
	it("offers bottom and right docking actions from the more menu", () => {
		const onLayoutChange = vi.fn()
		render(
			<DevConsolePanel
				consoleEntries={[]}
				networkEntries={[]}
				apiCallEntries={[]}
				messageEntries={[]}
				storageSnapshot={null}
				storageLoading={false}
				sourceCode=""
				dependencyEntries={[]}
				activeTab="console"
				onTabChange={vi.fn()}
				onClearConsole={vi.fn()}
				onClearNetwork={vi.fn()}
				onClearApiCalls={vi.fn()}
				onClearMessages={vi.fn()}
				onSendErrorToAgent={vi.fn()}
				onExecuteCode={vi.fn()}
				onRequestCompletions={vi.fn()}
				onRequestStorageSnapshot={vi.fn()}
				onRefreshHtml={vi.fn()}
				consoleErrorCount={0}
				networkErrorCount={0}
				apiCallErrorCount={0}
				onClose={vi.fn()}
				layout="bottom"
				onLayoutChange={onLayoutChange}
			/>,
		)

		expect(screen.getByTestId("dev-console-layout-bottom")).toBeInTheDocument()
		expect(screen.getByTestId("dev-console-layout-right")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("dev-console-layout-right"))
		expect(onLayoutChange).toHaveBeenCalledWith("right")
	})
})
