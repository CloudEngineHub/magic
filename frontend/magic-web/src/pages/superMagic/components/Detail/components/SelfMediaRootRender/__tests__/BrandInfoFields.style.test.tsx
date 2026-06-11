import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

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

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" data-testid="inline-voice-button" />,
}))

vi.mock("../components/SelfMediaInitPanel/hooks/useBrandImagePreviewHydration", () => ({
	useBrandImagePreviewHydration: () => ({ hydratingImageIds: new Set() }),
}))

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo/components/BrandAssetUpload", () => ({
	BrandAssetUpload: () => <div data-testid="brand-asset-upload" />,
}))

import { BrandInfoFields } from "../components/SelfMediaInitPanel/steps/StepBrandInfo/components/BrandInfoFields"

describe("BrandInfoFields wizard style", () => {
	it("uses translucent nested surfaces with embedded rows in the first init step", () => {
		render(
			<BrandInfoFields
				author=""
				brandPosition=""
				targetAudience=""
				brandImages={[]}
				onChange={vi.fn()}
				onBrandImagesChange={vi.fn()}
				fileStorageService={null}
				attachmentList={[]}
			/>,
		)

		const panel = screen.getByTestId("self-media-brand-info-wizard-panel")

		expect(panel).toHaveClass("rounded-lg")
		expect(panel).not.toHaveClass("border")
		expect(panel).toHaveClass("bg-[#434c81]/[0.045]")
		expect(screen.getByTestId("self-media-brand-info-wizard-grid")).toHaveClass(
			"lg:grid-cols-[minmax(0,1fr)_20rem]",
		)
		expect(screen.getByTestId("self-media-brand-field-author")).toHaveClass("border-0")
		expect(screen.getByTestId("self-media-brand-field-author")).toHaveClass("shadow-none")
		expect(screen.getByTestId("self-media-brand-field-author")).toHaveClass(
			"hover:bg-background/45",
		)
		expect(screen.getByTestId("self-media-brand-field-assets")).toHaveClass("bg-background/65")
		expect(screen.getByTestId("self-media-brand-field-assets")).toHaveClass(
			"hover:bg-background/80",
		)
		expect(screen.getByTestId("brand-asset-upload")).toBeInTheDocument()
	})
})
