import { act, fireEvent, render, screen } from "@testing-library/react"
import { observer } from "mobx-react-lite"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { PPTNotesPreferenceStore } from "../PPTNotesPreferenceStore"

describe("PPTNotesPreferenceStore", () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => vi.restoreAllMocks())

	it("defaults to collapsed and restores both choices after reload", () => {
		const store = new PPTNotesPreferenceStore()
		expect(store.visible).toBe(false)
		store.toggle()
		expect(new PPTNotesPreferenceStore().visible).toBe(true)
		store.toggle()
		expect(new PPTNotesPreferenceStore().visible).toBe(false)
	})

	it("updates multiple PPT consumers together", () => {
		const store = new PPTNotesPreferenceStore()
		const Presentation = observer(({ name }: { name: string }) => (
			<button onClick={store.toggle} aria-pressed={store.visible}>
				{name}
			</button>
		))
		render(
			<>
				<Presentation name="Deck A" />
				<Presentation name="Deck B" />
			</>,
		)
		fireEvent.click(screen.getByText("Deck A"))
		expect(screen.getByText("Deck B")).toHaveAttribute("aria-pressed", "true")
		act(() => store.setVisible(false))
		expect(screen.getByText("Deck A")).toHaveAttribute("aria-pressed", "false")
	})

	it("stays usable when browser storage is unavailable", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		const store = new PPTNotesPreferenceStore()
		expect(() => store.toggle()).not.toThrow()
		expect(store.visible).toBe(true)
	})
})
