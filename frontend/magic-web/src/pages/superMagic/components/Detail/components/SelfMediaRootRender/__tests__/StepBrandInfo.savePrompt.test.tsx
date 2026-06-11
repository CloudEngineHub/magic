import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import StepBrandInfo from "../components/SelfMediaInitPanel/steps/StepBrandInfo"
import type { StepBrandInfoRef } from "../components/SelfMediaInitPanel/steps/StepBrandInfo"

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
		success: vi.fn(),
	},
}))

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo/components/WelcomeHero", () => ({
	WelcomeHero: () => <div data-testid="welcome-hero" />,
}))

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo/components/BrandInfoFields", () => ({
	BrandInfoFields: ({
		onChange,
	}: {
		onChange: (field: "author" | "brandPosition" | "targetAudience", value: string) => void
	}) => (
		<button
			type="button"
			data-testid="edit-brand-info"
			onClick={() => {
				onChange("author", "Magic Lab")
				onChange("brandPosition", "AI tools")
			}}
		>
			edit brand info
		</button>
	),
}))

function makeBrandService() {
	return {
		listRecords: vi.fn().mockResolvedValue([]),
		saveRecord: vi.fn().mockResolvedValue({
			id: "brand-1",
			author: "Magic Lab",
			brandPosition: "AI tools",
			targetAudience: "",
			createdAt: 1,
		}),
		deleteRecord: vi.fn(),
	}
}

function BrandPromptHarness({
	initialAuthor = "",
	initialBrandPosition = "",
	onBrandServiceReady,
}: {
	initialAuthor?: string
	initialBrandPosition?: string
	onBrandServiceReady?: (brandService: ReturnType<typeof makeBrandService>) => void
}) {
	const brandInfoRef = useRef<StepBrandInfoRef>(null)
	const [author, setAuthor] = useState(initialAuthor)
	const [brandPosition, setBrandPosition] = useState(initialBrandPosition)
	const [advanced, setAdvanced] = useState(false)
	const [brandService] = useState(() => makeBrandService())

	onBrandServiceReady?.(brandService)

	const advanceThroughParentGuard = () => {
		if (brandInfoRef.current?.checkBeforeNext()) {
			setAdvanced(true)
		}
	}

	return (
		<>
			<StepBrandInfo
				ref={brandInfoRef}
				author={author}
				brandPosition={brandPosition}
				targetAudience=""
				brandImages={[]}
				onChange={(field, value) => {
					if (field === "author") setAuthor(value)
					if (field === "brandPosition") setBrandPosition(value)
				}}
				onBrandImagesChange={vi.fn()}
				brandService={brandService as any}
				onConfirmNext={advanceThroughParentGuard}
			/>
			<button type="button" data-testid="next-step" onClick={advanceThroughParentGuard}>
				next
			</button>
			{advanced && <div data-testid="advanced-step">advanced</div>}
		</>
	)
}

describe("StepBrandInfo save prompt behavior", () => {
	it("does not ask to save preloaded brand information when the user has not edited it", async () => {
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				initialAuthor="Project Brand"
				initialBrandPosition="Project positioning"
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		fireEvent.click(screen.getByTestId("next-step"))

		expect(screen.queryByTestId("self-media-save-confirm-overlay")).not.toBeInTheDocument()
		expect(screen.getByTestId("advanced-step")).toBeInTheDocument()
	})

	it("continues after skipping the save prompt for newly edited brand information", async () => {
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		fireEvent.click(screen.getByText("账号与品牌定位"))
		fireEvent.click(screen.getByTestId("edit-brand-info"))
		fireEvent.click(screen.getByTestId("next-step"))

		expect(screen.getByTestId("self-media-save-confirm-overlay")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("self-media-save-confirm-cancel"))

		expect(screen.queryByTestId("self-media-save-confirm-overlay")).not.toBeInTheDocument()
		expect(screen.getByTestId("advanced-step")).toBeInTheDocument()
	})
})
