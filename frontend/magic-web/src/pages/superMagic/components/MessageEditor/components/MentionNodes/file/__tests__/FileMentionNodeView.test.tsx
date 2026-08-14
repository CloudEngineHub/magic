import type { ComponentProps, ElementType, PropsWithChildren, ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import FileMentionNodeView from "../FileMentionNodeView"

const storeMocks = vi.hoisted(() => ({
	getFileById: vi.fn(),
}))

vi.mock("@tiptap/react", () => ({
	NodeViewWrapper: ({
		as: Component = "div",
		children,
		...props
	}: PropsWithChildren<{ as?: ElementType }>) => {
		const Wrapper = Component
		return <Wrapper {...props}>{children}</Wrapper>
	},
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
	initReactI18next: { type: "3rdParty", init: vi.fn() },
}))

vi.mock("@/pages/superMagic/components/MessageEditor/stores", () => ({
	useOptionalMessageEditorStore: () => ({
		fileUploadStore: {
			getFileById: storeMocks.getFileById,
		},
	}),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/components/AtItem/hooks/useObjectURL", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/hooks/useFileUrl", () => ({
	useFileUrl: () => ({
		fileUrl: "https://cdn.test/project.png",
		isLoading: false,
		hasError: false,
	}),
}))

vi.mock("@/components/base/MediaPreview", () => ({
	MediaPreviewThumbnail: ({ fallback }: { fallback: ReactNode }) => fallback,
	MediaPreviewTooltip: ({ children }: PropsWithChildren) => children,
}))

function createProps(
	type: MentionItemType,
	data: Record<string, unknown>,
): ComponentProps<typeof FileMentionNodeView> {
	return {
		attrs: { type, data },
		selected: false,
		deleteNode: vi.fn(),
	} as ComponentProps<typeof FileMentionNodeView>
}

describe("FileMentionNodeView", () => {
	beforeEach(() => {
		storeMocks.getFileById.mockReset()
	})

	it("keeps production upload progress behavior in the shared renderer", () => {
		storeMocks.getFileById.mockReturnValue({
			id: "file-1",
			name: "demo.mov",
			status: "uploading",
			progress: 42.4,
		})

		render(
			<FileMentionNodeView
				{...createProps(MentionItemType.UPLOAD_FILE, {
					file_id: "file-1",
					file_name: "demo.mov",
					file_extension: "mov",
				})}
			/>,
		)

		expect(screen.getByText("@demo.mov")).toBeInTheDocument()
		expect(screen.getByTestId("upload-file-mention-visual")).toHaveClass("h-[18px]")
		expect(screen.getByTestId("upload-file-mention-progress")).toHaveTextContent("42%")
		expect(screen.getByTestId("upload-file-mention-progress-background")).toHaveStyle({
			width: "42%",
		})
	})

	it("renders project media mentions through the shared renderer", () => {
		render(
			<FileMentionNodeView
				{...createProps(MentionItemType.PROJECT_FILE, {
					file_id: "project-file-1",
					file_name: "project.png",
					file_extension: "png",
					file_path: "project.png",
				})}
			/>,
		)

		expect(screen.getByText("@project.png")).toBeInTheDocument()
		expect(screen.getByTestId("file-mention-visual")).toBeInTheDocument()
	})
})
