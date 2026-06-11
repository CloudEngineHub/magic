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
	it("uses a translucent upload surface without a default border", () => {
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

		expect(trigger).toHaveClass("bg-[#434c81]/[0.095]")
		expect(trigger).toHaveClass("transition-transform")
		expect(trigger).toHaveClass("hover:-translate-y-0.5")
		expect(trigger).toHaveClass("after:bg-[#434c81]/[0.12]")
		expect(trigger).not.toHaveClass("border")
	})
})
