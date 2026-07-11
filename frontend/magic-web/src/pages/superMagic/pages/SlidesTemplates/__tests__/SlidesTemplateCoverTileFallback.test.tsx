import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import type {
	TemplateColorExtractionRequest,
	TemplateColorExtractionResponse,
} from "../templateColorExtractionProtocol"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "en_US" },
		t: (key: string) => key,
	}),
}))

class FakeWorker {
	static instance: FakeWorker | null = null

	onerror: ((event: ErrorEvent) => void) | null = null
	onmessage: ((event: MessageEvent<TemplateColorExtractionResponse>) => void) | null = null
	readonly requests: TemplateColorExtractionRequest[] = []

	constructor() {
		FakeWorker.instance = this
	}

	postMessage(request: TemplateColorExtractionRequest) {
		this.requests.push(request)
	}

	respond(colors: string[]) {
		const request = this.requests[this.requests.length - 1]
		if (!request) throw new Error("No template color request to resolve")
		this.onmessage?.({
			data: { colors, requestId: request.requestId },
		} as MessageEvent<TemplateColorExtractionResponse>)
	}

	terminate() {
		return undefined
	}
}

describe("SlidesTemplateCoverTile color fallback", () => {
	beforeAll(() => {
		vi.stubGlobal("Worker", FakeWorker)
	})

	afterAll(() => {
		vi.unstubAllGlobals()
	})

	it("extracts colors after hover without changing the original template", async () => {
		const { default: SlidesTemplateCoverTile } = await import("../SlidesTemplateCoverTile")
		const template: OptionItem = {
			label: "Fallback template",
			value: "fallback-template",
		}
		const onFindSimilarColors = vi.fn()

		render(
			<SlidesTemplateCoverTile
				canPreview={false}
				imageUrl="https://example.com/fallback.png"
				isExpanded={false}
				isSelected={false}
				onFindSimilarColors={onFindSimilarColors}
				onPreviewClick={vi.fn()}
				onSelect={vi.fn()}
				template={template}
			/>,
		)

		expect(screen.queryByTestId("slides-template-color-palette")).not.toBeInTheDocument()
		fireEvent.pointerEnter(screen.getByTestId("slides-template-cover-tile"))

		await waitFor(() => expect(FakeWorker.instance?.requests).toHaveLength(1))
		act(() => {
			FakeWorker.instance?.respond(["#315ECA", "#7AA7FF", "#182A5A"])
		})

		const palette = await screen.findByTestId("slides-template-color-palette")
		fireEvent.click(palette)

		expect(onFindSimilarColors).toHaveBeenCalledWith({
			...template,
			colors: ["#315ECA", "#7AA7FF", "#182A5A"],
		})
		expect(template.colors).toBeUndefined()
	})
})
