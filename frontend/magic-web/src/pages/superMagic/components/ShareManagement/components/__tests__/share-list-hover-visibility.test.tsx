import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FileShareItem, TopicShareItem } from "../../types"
import { ResourceType, ShareType } from "../../../Share/types"
import FileShareListNew from "../FileShareListNew"
import TopicShareListNew from "../TopicShareListNew"

const mockDeviceState = vi.hoisted(() => ({
	isNoHoverCoarsePointer: false,
}))

vi.mock("@/utils/devices", () => ({
	isNoHoverCoarsePointer: () => mockDeviceState.isNoHoverCoarsePointer,
}))

vi.mock("react-i18next", async (importOriginal) => ({
	...(await importOriginal<typeof import("react-i18next")>()),
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) =>
			values ? `${key}:${JSON.stringify(values)}` : key,
	}),
}))

vi.mock("antd", () => ({
	Dropdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/base/MagicEllipseWithTooltip/MagicEllipseWithTooltip", () => ({
	default: ({ text, className }: { text: string; className?: string }) => (
		<span className={className}>{text}</span>
	),
}))

vi.mock("../ProjectNameBadge", () => ({
	default: ({ projectName }: { projectName: string }) => <span>{projectName}</span>,
}))

vi.mock("../../hooks/useShareItemActions", () => ({
	useShareItemActions: () => ({
		getDropdownItems: () => [{ key: "mock-action", label: "mock-action" }],
	}),
}))

vi.mock("../../hooks/useShareSuccessModal", () => ({
	useShareSuccessModal: () => ({
		currentItem: null,
		visible: false,
		open: vi.fn(),
		close: vi.fn(),
	}),
}))

vi.mock("../../hooks/useTopicSharePopover", () => ({
	useTopicSharePopover: () => ({
		currentItem: null,
		open: false,
		openPopover: vi.fn(),
		closePopover: vi.fn(),
	}),
}))

vi.mock("../../../Share/Modal", () => ({
	default: () => <div data-testid="share-modal" />,
}))

vi.mock("../../../Share/FileShareModal/ShareSuccessModal", () => ({
	default: () => <div data-testid="share-success-modal" />,
}))

vi.mock("../../../TopicSharePopover", () => ({
	default: () => <div data-testid="topic-share-popover" />,
}))

vi.mock(
	"@/pages/superMagicMobile/components/HierarchicalWorkspacePopup/components/ModeTag",
	() => ({
		default: () => <span data-testid="mode-tag" />,
	}),
)

vi.mock("../../../Share/svg/public.svg", () => ({ default: "public.svg" }))
vi.mock("../../../Share/svg/protected.svg", () => ({ default: "protected.svg" }))
vi.mock("../../../Share/svg/team.svg", () => ({ default: "team.svg" }))

/**
 * Creates a synthetic file-share row for hover visibility tests.
 */
function createFileShare(overrides: Partial<FileShareItem> = {}): FileShareItem {
	return {
		title: "Mock File Share",
		project_id: "mock-project-id",
		project_name: "Mock Project",
		workspace_id: "mock-workspace-id",
		workspace_name: "Mock Workspace",
		resource_type: ResourceType.File,
		share_type: ShareType.PasswordProtected,
		resource_id: "mock-file-share-id",
		has_password: true,
		password: "mock-password",
		main_file_name: "mock-document.md",
		file_ids: ["mock-file-id"],
		extend: {
			file_count: 1,
		},
		view_count: 3,
		expire_at: "2099/01/02 03:04:05",
		created_at: "2098/01/02 03:04:05",
		...overrides,
	}
}

/**
 * Creates a synthetic topic-share row for hover visibility tests.
 */
function createTopicShare(overrides: Partial<TopicShareItem> = {}): TopicShareItem {
	return {
		title: "Mock Topic Share",
		topic_id: "mock-topic-id",
		project_id: "mock-project-id",
		project_name: "Mock Project",
		workspace_id: "mock-workspace-id",
		workspace_name: "Mock Workspace",
		resource_type: ResourceType.Topic,
		share_type: ShareType.PasswordProtected,
		resource_id: "mock-topic-share-id",
		has_password: true,
		is_password_enabled: true,
		password: "mock-password",
		shared_at: "2099/01/02 03:04:05",
		created_at: "2098/01/02 03:04:05",
		view_count: 5,
		...overrides,
	}
}

describe("Share management hover action visibility", () => {
	beforeEach(() => {
		mockDeviceState.isNoHoverCoarsePointer = false
	})

	it("keeps file share actions hidden until hover in a normal browser", () => {
		const longTitle = "A very long shared file name that must yield space to the status badge"
		render(
			<FileShareListNew
				data={[createFileShare({ title: longTitle })]}
				loading={false}
				onCancelShare={vi.fn()}
				onRefresh={vi.fn()}
			/>,
		)

		expect(screen.getByText(longTitle)).toHaveClass("min-w-0", "flex-1", "truncate")
		expect(screen.getByText("share.passwordProtected")).toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: "shareManagement.more" }),
		).not.toBeInTheDocument()

		fireEvent.mouseEnter(screen.getByTestId("set-hovered-id"))

		expect(screen.getByRole("button", { name: "shareManagement.more" })).toBeInTheDocument()
	})

	it("pins file share actions in a no-hover browser while keeping the share type badge", () => {
		mockDeviceState.isNoHoverCoarsePointer = true

		render(
			<FileShareListNew
				data={[createFileShare()]}
				loading={false}
				onCancelShare={vi.fn()}
				onRefresh={vi.fn()}
			/>,
		)

		expect(screen.getByText("share.passwordProtected")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "shareManagement.more" })).toBeInTheDocument()
	})

	it("pins topic share actions in a no-hover browser while keeping the shared time", () => {
		mockDeviceState.isNoHoverCoarsePointer = true

		render(
			<TopicShareListNew
				data={[createTopicShare()]}
				loading={false}
				onCancelShare={vi.fn()}
				onRefresh={vi.fn()}
			/>,
		)

		expect(screen.getByText(/shareManagement.sharedAt/)).toBeInTheDocument()
		expect(screen.getByText(/2099\/01\/02 03:04:05/)).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "shareManagement.more" })).toBeInTheDocument()
	})
})
