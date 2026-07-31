import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CARD_IMAGE_PROCESS } from "../constants/imageProcess"

const { mockCardFrame } = vi.hoisted(() => ({
	mockCardFrame: vi.fn(() => <div data-testid="card-frame" />),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
		open ? <div>{children}</div> : null,
}))

vi.mock("@/components/shadcn-ui/select", () => ({
	Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectValue: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("../components/CardFrame", () => ({
	default: mockCardFrame,
}))

import { CardVersionCompareDialog } from "../components/CardVersionCompareDialog"

describe("CardVersionCompareDialog", () => {
	beforeEach(() => {
		mockCardFrame.mockClear()
	})

	it("uses the shared 2x image process options for the latest-version preview", () => {
		render(
			<CardVersionCompareDialog
				open
				onOpenChange={vi.fn()}
				fileId="latest-card"
				historyContent="<html><body>history</body></html>"
				historyVersion={2}
				fileVersionsList={[]}
				onUseHistoryVersion={vi.fn()}
				onUseLatestVersion={vi.fn()}
				onSwitchHistoryVersion={vi.fn()}
			/>,
		)

		expect(mockCardFrame.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				fileId: "latest-card",
				imageProcessOptions: CARD_IMAGE_PROCESS,
			}),
		)
	})
})
