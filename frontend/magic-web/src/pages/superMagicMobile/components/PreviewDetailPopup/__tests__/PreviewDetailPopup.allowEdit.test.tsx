import { act, createRef } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DetailType } from "@/pages/superMagic/components/Detail/types"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import PreviewDetailPopup, { type PreviewDetailPopupRef } from ".."

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => true,
}))

vi.mock("react-router", () => ({
	useLocation: () => ({ pathname: "/mobile/project", search: "" }),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("antd-mobile", () => ({
	Toast: {
		show: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/components/Detail/hooks/useDetailActions", () => ({
	useDetailActions: () => ({
		isFullscreen: false,
		setIsFullscreen: vi.fn(),
		isFromNode: false,
		handlePrevious: vi.fn(),
		handleNext: vi.fn(),
		handleFullscreen: vi.fn(),
		handleDownload: vi.fn(),
		allFiles: [],
		currentIndex: 0,
		effectiveAttachments: [],
	}),
}))

vi.mock("@/pages/superMagic/components/Detail/components/FilesViewer/utils/preview", () => ({
	correctDetailType: (detail: unknown) => detail,
}))

vi.mock("@/pages/superMagic/utils/share", () => ({
	copyFileContent: vi.fn(),
}))

vi.mock("@/pages/superMagic/utils/handleFIle", () => ({
	getFileType: () => DetailType.Code,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/MessageAttachment/utils", () => ({
	getAttachmentExtension: () => "",
}))

vi.mock("@/components/base/MagicFileIcon", () => ({
	default: () => <span data-testid="magic-file-icon" />,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/Tool/components/ToolIcon", () => ({
	default: () => <span data-testid="tool-icon" />,
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({ children, visible }: { children: React.ReactNode; visible?: boolean }) =>
		visible ? <div data-testid="magic-popup">{children}</div> : null,
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
		open ? <div data-testid="magic-modal">{children}</div> : null,
}))

vi.mock("@/pages/superMagic/components/Detail/Render", () => ({
	default: ({ allowEdit }: { allowEdit?: boolean }) => (
		<div data-testid="preview-render" data-allow-edit={String(allowEdit)} />
	),
}))

describe("PreviewDetailPopup allowEdit", () => {
	it("passes editable state into the rendered detail on mobile preview", async () => {
		const popupRef = createRef<PreviewDetailPopupRef>()

		render(
			<PreviewDetailPopup
				ref={popupRef}
				allowEdit
				setUserSelectDetail={vi.fn()}
				selectedProject={{ id: "project-1" } as ProjectListItem}
				selectedTopic={{ id: "topic-1" } as Topic}
			/>,
		)

		await act(async () => {
			popupRef.current?.open(
				{
					type: DetailType.SelfMedia,
					currentFileId: "self-media-root",
					data: {
						file_id: "self-media-root",
						file_name: "Self Media",
						file_extension: "",
					},
				},
				[],
				[],
			)
		})

		expect(screen.getByTestId("preview-render")).toHaveAttribute("data-allow-edit", "true")
	})
})
