import { describe, expect, it } from "vitest"
import { getEditableTextContent, setElementTextContent } from "../textContent"

describe("setElementTextContent", () => {
	it("replaces text of a simple text element", () => {
		const element = document.createElement("p")
		element.textContent = "Original"

		setElementTextContent(element, "Updated")

		expect(element.textContent).toBe("Updated")
		expect(element.childNodes).toHaveLength(1)
	})

	it("keeps an image when updating a mixed container", () => {
		const element = document.createElement("div")
		const image = document.createElement("img")
		image.src = "icon.png"
		element.append(image, "从低渗透率盆地读向高增长脊线")

		setElementTextContent(element, "新的标题")

		expect(element.querySelector("img")).toBe(image)
		expect(image.getAttribute("src")).toBe("icon.png")
		expect(element.textContent).toBe("新的标题")
	})

	it("keeps nested media when text lives in a child", () => {
		const element = document.createElement("div")
		const image = document.createElement("img")
		const title = document.createElement("h2")
		title.textContent = "Original title"
		element.append(image, title)

		setElementTextContent(element, "Updated title")

		expect(element.querySelector("img")).toBe(image)
		expect(title.textContent).toBe("Updated title")
	})

	it("does not empty sibling text elements", () => {
		const element = document.createElement("div")
		element.append("Title")
		const subtitle = document.createElement("p")
		subtitle.textContent = "Subtitle"
		element.append(subtitle)

		setElementTextContent(element, "New title")

		expect(element.childNodes[0]?.textContent).toBe("New title")
		expect(subtitle.textContent).toBe("Subtitle")
	})

	it("still replaces phrasing markup like a simple text edit", () => {
		const element = document.createElement("p")
		element.innerHTML = "Hello <strong>World</strong>"

		setElementTextContent(element, "Hi")

		expect(element.textContent).toBe("Hi")
		expect(element.querySelector("strong")).toBeNull()
	})
})

describe("getEditableTextContent", () => {
	it("returns full text for phrasing-only elements", () => {
		const element = document.createElement("p")
		element.innerHTML = "Hello <strong>World</strong>"

		expect(getEditableTextContent(element)).toBe("Hello World")
	})

	it("returns only direct text for mixed containers", () => {
		const element = document.createElement("div")
		const image = document.createElement("img")
		element.append(image, "Title")
		const subtitle = document.createElement("p")
		subtitle.textContent = "Subtitle"
		element.append(subtitle)

		expect(getEditableTextContent(element)).toBe("Title")
	})
})
