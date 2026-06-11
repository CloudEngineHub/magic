import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { mockUseSelfMediaBrandConfig } = vi.hoisted(() => ({
	mockUseSelfMediaBrandConfig: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (_key: string, fallback?: string) => fallback || _key,
	}),
}))

vi.mock("antd", () => ({
	message: {
		error: vi.fn(),
	},
}))

vi.mock("../hooks/useSelfMediaBrandConfig", () => ({
	useSelfMediaBrandConfig: mockUseSelfMediaBrandConfig,
}))

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo/components/BrandAssetUpload", () => ({
	BrandAssetUpload: ({ layout }: { layout?: string }) => (
		<div data-layout={layout} data-testid="brand-asset-upload" />
	),
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" data-testid="inline-voice-button" />,
}))

vi.mock("../components/SelfMediaInitPanel/hooks/useBrandImagePreviewHydration", () => ({
	useBrandImagePreviewHydration: () => ({ hydratingImageIds: new Set() }),
}))

import BrandConfigDialog from "../components/BrandConfigDialog"

describe("BrandConfigDialog style", () => {
	it("uses a compact settings layout instead of the wizard-style form", () => {
		mockUseSelfMediaBrandConfig.mockReturnValue({
			settings: {
				author: "Magic Lab",
				brandPosition: "AI tools",
				targetAudience: "Creators",
				brandImages: [],
			},
			saveSettings: vi.fn(),
			isLoading: false,
			isSaving: false,
		})

		render(<BrandConfigDialog open onOpenChange={vi.fn()} fileStorageService={null} />)

		const dialog = screen.getByTestId("self-media-brand-config-dialog")

		expect(dialog).toHaveClass("!max-w-3xl")
		expect(dialog).not.toHaveClass("!max-w-5xl")
		expect(screen.getByTestId("self-media-brand-config-settings-layout")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-settings-layout")).toHaveClass(
			"lg:items-start",
		)
		expect(screen.getByTestId("self-media-brand-config-profile-card")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-assets-card")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-assets-card")).toHaveClass("h-fit")
		expect(screen.getByTestId("brand-asset-upload")).toHaveAttribute("data-layout", "stacked")
		expect(screen.getByTestId("self-media-brand-config-save-button")).toHaveAttribute(
			"data-slot",
			"button",
		)
	})
})
