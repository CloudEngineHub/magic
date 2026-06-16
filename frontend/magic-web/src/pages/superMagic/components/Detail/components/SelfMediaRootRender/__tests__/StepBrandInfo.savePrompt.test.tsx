import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import StepBrandInfo from "../components/SelfMediaInitPanel/steps/StepBrandInfo"
import type {
	BrandAutoSaveStatus,
	StepBrandInfoRef,
} from "../components/SelfMediaInitPanel/steps/StepBrandInfo"
import type { SelfMediaBrandRecordService } from "@/services/selfMedia"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (
			key: string,
			fallbackOrOptions?: string | { defaultValue?: string; [key: string]: unknown },
		) => {
			if (!fallbackOrOptions || typeof fallbackOrOptions === "string") {
				return fallbackOrOptions || key
			}
			return Object.entries(fallbackOrOptions).reduce((text, [name, value]) => {
				if (name === "defaultValue") return text
				return text.replace(`{{${name}}}`, String(value))
			}, fallbackOrOptions.defaultValue || key)
		},
	}),
}))

vi.mock("antd", () => ({
	message: {
		success: vi.fn(),
	},
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

function makeBrandService(
	records: Array<{
		id: string
		author: string
		brandPosition: string
		targetAudience: string
		createdAt: number
	}> = [],
	saveRecord = vi.fn().mockResolvedValue({
		id: "brand-1",
		author: "Magic Lab",
		brandPosition: "AI tools",
		targetAudience: "",
		createdAt: 1,
	}),
	listRecords = vi.fn().mockResolvedValue(records),
) {
	return {
		listRecords,
		saveRecord,
		deleteRecord: vi.fn(),
	}
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve
		reject = promiseReject
	})
	return { promise, resolve, reject }
}

function BrandPromptHarness({
	initialAuthor = "",
	initialBrandPosition = "",
	records = [],
	brandAutoSaveStatus = "idle",
	saveRecord,
	listRecords,
	onBrandServiceReady,
}: {
	initialAuthor?: string
	initialBrandPosition?: string
	records?: Parameters<typeof makeBrandService>[0]
	brandAutoSaveStatus?: BrandAutoSaveStatus
	saveRecord?: Parameters<typeof makeBrandService>[1]
	listRecords?: Parameters<typeof makeBrandService>[2]
	onBrandServiceReady?: (brandService: ReturnType<typeof makeBrandService>) => void
}) {
	const brandInfoRef = useRef<StepBrandInfoRef>(null)
	const [author, setAuthor] = useState(initialAuthor)
	const [brandPosition, setBrandPosition] = useState(initialBrandPosition)
	const [advanced, setAdvanced] = useState(false)
	const [brandService] = useState(() => makeBrandService(records, saveRecord, listRecords))

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
				brandService={brandService as unknown as SelfMediaBrandRecordService}
				onConfirmNext={advanceThroughParentGuard}
				brandAutoSaveStatus={brandAutoSaveStatus}
			/>
			<button type="button" data-testid="next-step" onClick={advanceThroughParentGuard}>
				next
			</button>
			{advanced && <div data-testid="advanced-step">advanced</div>}
		</>
	)
}

describe("StepBrandInfo save prompt behavior", () => {
	it("starts from the brand decision without an extra welcome block", async () => {
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		expect(screen.queryByTestId("welcome-hero")).not.toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-collapsed-header")).toBeInTheDocument()
	})

	it("keeps the empty brand header short and skippable", async () => {
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		expect(screen.getByText("后续可在品牌设置里补充。")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-collapsed-header").className).toContain(
			"lg:max-w-[calc(100%_-_20.5rem)]",
		)
		expect(screen.queryByText("Optional Brand Profile")).not.toBeInTheDocument()
	})

	it("opens the brand form automatically when there is no reusable brand information", async () => {
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		expect(screen.getByTestId("edit-brand-info")).toBeInTheDocument()
	})

	it("keeps the auto-filled reusable brand information collapsed", async () => {
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				records={[
					{
						id: "brand-1",
						author: "Magic Lab",
						brandPosition: "AI tools",
						targetAudience: "Creators",
						createdAt: 1,
					},
				]}
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		expect(screen.getByText("Magic Lab · AI tools")).toBeInTheDocument()
		expect(screen.queryByTestId("edit-brand-info")).not.toBeInTheDocument()
	})

	it("opens the brand form if reusable brand information cannot be loaded", async () => {
		const listRecords = vi.fn().mockRejectedValue(new Error("load records failed"))
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
		let brandService: ReturnType<typeof makeBrandService> | undefined
		try {
			render(
				<BrandPromptHarness
					listRecords={listRecords}
					onBrandServiceReady={(service) => {
						brandService = service
					}}
				/>,
			)

			await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

			expect(screen.getByTestId("edit-brand-info")).toBeInTheDocument()
			expect(consoleError).toHaveBeenCalledWith(
				"Failed to load self-media brand records:",
				expect.any(Error),
			)
		} finally {
			consoleError.mockRestore()
		}
	})

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

	it("summarizes completed brand info in the collapsed header", async () => {
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

		expect(screen.getByText("品牌信息已就绪")).toBeInTheDocument()
		expect(screen.getByText("Project Brand · Project positioning")).toBeInTheDocument()
		expect(screen.queryByText("Optional Brand Profile")).not.toBeInTheDocument()
		expect(
			screen.queryByText("品牌信息选填，用于让 AI 更懂你；也可以直接进入下一步。"),
		).not.toBeInTheDocument()
	})

	it("renders auto-save feedback as compact live microcopy", async () => {
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				initialAuthor="Project Brand"
				initialBrandPosition="Project positioning"
				brandAutoSaveStatus="saved"
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		const autoSaveStatus = screen.getByTestId("self-media-brand-auto-save-status")
		expect(autoSaveStatus).toHaveTextContent("已自动保存")
		expect(autoSaveStatus).toHaveAttribute("aria-live", "polite")
		expect(autoSaveStatus).toHaveClass("rounded-full")
		expect(screen.queryByText("自动保存说明")).not.toBeInTheDocument()
	})

	it("uses the current home-style collapsed brand header", async () => {
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				initialAuthor="Project Brand"
				initialBrandPosition="Project positioning"
				brandAutoSaveStatus="saved"
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		const header = screen.getByTestId("self-media-brand-collapsed-header")
		expect(header).toHaveClass("rounded-[24px]")
		expect(header).toHaveClass("bg-white/90")
		expect(header).toHaveClass("shadow-[inset_0_1px_rgba(255,255,255,0.82)]")
		expect(header.className).not.toContain("#434c81")
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

		fireEvent.click(screen.getByTestId("edit-brand-info"))
		fireEvent.click(screen.getByTestId("next-step"))

		expect(screen.getByTestId("self-media-save-confirm-overlay")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("self-media-save-confirm-cancel"))

		expect(screen.queryByTestId("self-media-save-confirm-overlay")).not.toBeInTheDocument()
		expect(screen.getByTestId("advanced-step")).toBeInTheDocument()
	})

	it("keeps the save prompt busy and prevents duplicate save submits", async () => {
		const deferred = createDeferred<{
			id: string
			author: string
			brandPosition: string
			targetAudience: string
			createdAt: number
		}>()
		const saveRecord = vi.fn().mockReturnValue(deferred.promise)
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				saveRecord={saveRecord}
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		fireEvent.click(screen.getByTestId("edit-brand-info"))
		fireEvent.click(screen.getByTestId("next-step"))

		const confirmButton = screen.getByTestId("self-media-save-confirm-confirm")
		fireEvent.click(confirmButton)
		fireEvent.click(confirmButton)

		expect(saveRecord).toHaveBeenCalledTimes(1)
		expect(confirmButton).toBeDisabled()
		expect(confirmButton).toHaveAttribute("aria-busy", "true")
		expect(confirmButton).toHaveTextContent("正在保存")
		expect(screen.getByTestId("self-media-save-confirm-overlay")).toBeInTheDocument()
		expect(screen.queryByTestId("advanced-step")).not.toBeInTheDocument()

		deferred.resolve({
			id: "brand-1",
			author: "Magic Lab",
			brandPosition: "AI tools",
			targetAudience: "",
			createdAt: 1,
		})

		await waitFor(() => {
			expect(screen.queryByTestId("self-media-save-confirm-overlay")).not.toBeInTheDocument()
		})
		expect(screen.getByTestId("advanced-step")).toBeInTheDocument()
	})

	it("surfaces saved brand records as a one-click fill shortcut", async () => {
		let brandService: ReturnType<typeof makeBrandService> | undefined
		render(
			<BrandPromptHarness
				records={[
					{
						id: "brand-1",
						author: "Magic Lab",
						brandPosition: "AI tools",
						targetAudience: "Creators",
						createdAt: 1,
					},
				]}
				onBrandServiceReady={(service) => {
					brandService = service
				}}
			/>,
		)

		await waitFor(() => expect(brandService?.listRecords).toHaveBeenCalled())

		expect(screen.getByRole("button", { name: /一键回填/ })).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: /历史记录/ })).not.toBeInTheDocument()
	})
})
