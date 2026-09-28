import { fireEvent, render, screen } from "@testing-library/react"
import { afterAll, expect, it, vi } from "vitest"
import MicroAppEntryFileSelect from "../MicroAppEntryFileSelect"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const originalScrollIntoView = Element.prototype.scrollIntoView
Element.prototype.scrollIntoView = vi.fn()
afterAll(() => {
	Element.prototype.scrollIntoView = originalScrollIntoView
})

it("searches paths across folders and selects the matching HTML file", () => {
	const onChange = vi.fn()
	render(
		<MicroAppEntryFileSelect
			value={null}
			onChange={onChange}
			attachmentList={[
				{ file_id: "root", file_name: "index.html", relative_file_path: "index.html" },
				{
					file_id: "nested",
					file_name: "index.html",
					relative_file_path: "pages/index.html",
				},
			]}
		/>,
	)
	fireEvent.click(screen.getByTestId("micro-app-default-open-file"))
	const search = screen.getByPlaceholderText("microAppPage.publish.defaultOpenFileSearch")
	fireEvent.change(search, { target: { value: "PAGES/" } })
	expect(screen.getByRole("option", { name: "pages/index.html" })).toBeInTheDocument()
	expect(screen.queryByRole("option", { name: "index.html" })).not.toBeInTheDocument()
	fireEvent.change(search, { target: { value: "missing" } })
	expect(screen.getByText("microAppPage.publish.defaultOpenFileEmpty")).toBeInTheDocument()
	fireEvent.change(search, { target: { value: "pages/" } })
	fireEvent.click(screen.getByRole("option", { name: "pages/index.html" }))
	expect(onChange).toHaveBeenCalledWith("nested")
})
