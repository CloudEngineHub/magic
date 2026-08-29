import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { MentionMediaSource } from "@/pages/superMagic/components/MessageEditor/components/MentionMedia/useMentionMediaSource"
import { useMentionMediaSource } from "@/pages/superMagic/components/MessageEditor/components/MentionMedia/useMentionMediaSource"
import InlineMention from "../InlineMention"

const mediaSource: MentionMediaSource = {
	mediaType: "image",
	thumbnailUrl: "https://cdn.test/cover.png",
	previewUrl: "https://cdn.test/cover.png",
	audioUrl: null,
	isLoading: false,
	hasError: false,
}

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
	initReactI18next: { type: "3rdParty", init: vi.fn() },
}))

vi.mock(
	"@/pages/superMagic/components/MessageEditor/components/MentionMedia/useMentionMediaSource",
	() => ({
		useMentionMediaSource: vi.fn(),
	}),
)

vi.mock(
	"@/pages/superMagic/components/MessageEditor/components/MentionNodes/marker/useTransformedMarkerData",
	() => ({
		useTransformedMarkerData: () => ({ markerData: null, loading: false }),
	}),
)

vi.mock(
	"@/pages/superMagic/components/MessageEditor/components/MentionNodes/marker/useMarkerImageUrl",
	() => ({
		useMarkerImageUrl: () => ({ imageUrl: null }),
	}),
)

vi.mock("@/pages/superMagic/components/MessageEditor/hooks/useMarkerClickHandler", () => ({
	useMarkerClickHandler: () => ({ handleMarkerClick: vi.fn() }),
}))

vi.mock(
	"@/pages/superMagic/components/MessageEditor/components/AtItem/components/MobileImagePreview",
	() => ({ showMobileImagePreview: vi.fn() }),
)

function createMention(fileName: string, fileExtension: string): TiptapMentionAttributes {
	return {
		type: MentionItemType.PROJECT_FILE,
		data: {
			file_id: "file-1",
			file_name: fileName,
			file_extension: fileExtension,
			file_path: fileName,
		},
	} as TiptapMentionAttributes
}

describe("InlineMention", () => {
	beforeEach(() => {
		vi.mocked(useMentionMediaSource).mockReturnValue(mediaSource)
	})

	it("renders a media icon before the filename and uses the complete mention as tooltip trigger", async () => {
		const { container } = render(<InlineMention data={createMention("cover.png", "png")} />)

		expect(screen.getByTestId("inline-file-mention-icon")).toBeInTheDocument()
		expect(screen.getByRole("img")).toHaveAttribute("src", mediaSource.thumbnailUrl)

		const trigger = container.querySelector("[data-media-preview-trigger]") as HTMLElement
		expect(trigger).toHaveTextContent("cover.png")
		fireEvent.pointerMove(trigger)
		expect(await screen.findByRole("tooltip")).toBeInTheDocument()
	})

	it("does not render a media icon for non-media file mentions", () => {
		vi.mocked(useMentionMediaSource).mockReturnValue({
			...mediaSource,
			mediaType: null,
			thumbnailUrl: null,
			previewUrl: null,
		})

		render(<InlineMention data={createMention("README.md", "md")} />)

		expect(screen.queryByTestId("inline-file-mention-icon")).not.toBeInTheDocument()
		expect(screen.getByText("README.md")).toBeInTheDocument()
	})
})
