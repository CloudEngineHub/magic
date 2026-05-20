import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

const mockStore = vi.hoisted(() => ({
	platforms: ["rednote"],
	resolvedPlatform: "rednote",
	rootLoading: false,
	handleChangePlatform: vi.fn(),
}))

vi.mock("react-dom", async () => {
	const actual = await vi.importActual<typeof import("react-dom")>("react-dom")
	return {
		...actual,
		createPortal: (node: React.ReactNode) => node,
	}
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			(
				({
					"detail.selfMedia.platform.switcher.label": "Platform",
					"detail.selfMedia.platform.actions.create": "New article",
					"detail.selfMedia.platform.actions.back": "Back to content",
				}) as Record<string, string>
			)[key] ?? key,
	}),
}))

vi.mock("mobx-react-lite", () => ({
	observer: (component: unknown) => component,
}))

vi.mock("@/components/base/MagicSpin", () => ({
	default: function MockMagicSpin() {
		return <div>loading</div>
	},
}))

vi.mock("antd", () => ({
	Flex: function MockFlex({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
		return <div {...props}>{children}</div>
	},
}))

vi.mock("../components/PlatformSwitcher", () => ({
	default: function MockPlatformSwitcher() {
		return <div data-testid="self-media-platform-switcher">platform-switcher</div>
	},
}))

vi.mock("../components/UnsupportedPlatform", () => ({
	default: function MockUnsupportedPlatform() {
		return <div>unsupported-platform</div>
	},
}))

vi.mock("../components/SelfMediaInitPanel", () => ({
	default: function MockSelfMediaInitPanel() {
		return <div data-testid="mock-self-media-init-panel">init-panel</div>
	},
}))

vi.mock("../platforms", () => ({
	getPlatformComponent: () =>
		function MockPlatformComponent() {
			return <div data-testid="mock-platform-component">platform-content</div>
		},
}))

vi.mock("../stores", () => ({
	SelfMediaStoreProvider: function MockSelfMediaStoreProvider({
		children,
	}: {
		children: React.ReactNode
	}) {
		return <>{children}</>
	},
	useSelfMediaStore: () => mockStore,
}))

vi.mock("../context/PlatformChromeContext", () => ({
	SelfMediaPlatformChromeProvider: function MockPlatformChromeProvider({
		children,
	}: {
		children: React.ReactNode
	}) {
		return <>{children}</>
	},
	useSelfMediaPlatformChrome: () => ({
		hostElement: document.createElement("div"),
	}),
}))

import SelfMediaRootRender from "../index"

describe("SelfMediaRootRender", () => {
	beforeEach(() => {
		mockStore.platforms = ["rednote"]
		mockStore.resolvedPlatform = "rednote"
		mockStore.rootLoading = false
		mockStore.handleChangePlatform.mockReset()
	})

	it("opens the init panel from the top create entry and can go back", () => {
		render(
			<SelfMediaRootRender
				data={{ file_id: "folder-1", file_name: "self-media" } as any}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		expect(screen.getByTestId("mock-platform-component")).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "New article" }))

		expect(screen.getByTestId("mock-self-media-init-panel")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-platform-component")).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "Back to content" }))

		expect(screen.getByTestId("mock-platform-component")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-self-media-init-panel")).not.toBeInTheDocument()
	})
})
