import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BrandAssetUpload } from "../components/SelfMediaInitPanel/steps/StepBrandInfo/components/BrandAssetUpload"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (_key: string, fallback?: string) => fallback || _key,
	}),
}))

vi.mock("@/stores/projectFiles", () => ({
	default: {
		workspaceFilesList: [],
	},
}))

vi.mock("../components/SelfMediaInitPanel/lib/useDropZone", () => ({
	useDropZone: () => ({
		isDragging: false,
		dropZoneProps: {},
	}),
}))

describe("BrandAssetUpload style", () => {
	it("uses the current black-yellow accent surface without a default border", () => {
		render(
			<BrandAssetUpload
				brandImages={[]}
				brandImageUploadProgress={{}}
				hydratingImageIds={new Set()}
				isFetching={false}
				onFilesSelect={vi.fn()}
				onRemoveBrandImage={vi.fn()}
				onBrandImageDescChange={vi.fn()}
				enableProjectPicker={false}
			/>,
		)

		const trigger = screen.getByTestId("self-media-brand-asset-upload-trigger")

		expect(trigger).toHaveClass("rounded-[20px]")
		expect(trigger).toHaveClass("bg-[#f8f8f9]")
		expect(trigger).toHaveClass("transition-transform")
		expect(trigger).toHaveClass("hover:-translate-y-0.5")
		expect(trigger).toHaveClass("after:bg-[#ffd637]/35")
		expect(trigger.className).not.toContain("#434c81")
		expect(trigger).not.toHaveClass("border")
	})

	it("uses a quiet settings upload surface in stacked layout", () => {
		render(
			<BrandAssetUpload
				brandImages={[]}
				brandImageUploadProgress={{}}
				hydratingImageIds={new Set()}
				isFetching={false}
				onFilesSelect={vi.fn()}
				onRemoveBrandImage={vi.fn()}
				onBrandImageDescChange={vi.fn()}
				enableProjectPicker={false}
				layout="stacked"
			/>,
		)

		const trigger = screen.getByTestId("self-media-brand-asset-upload-trigger")

		expect(trigger).toHaveClass("bg-[#f8f8f9]")
		expect(trigger).toHaveClass("border-[#18181b]/[0.06]")
		expect(trigger).not.toHaveClass("backdrop-blur")
		expect(trigger).toHaveClass("shadow-[inset_0_1px_rgba(255,255,255,0.78)]")
	})
})
