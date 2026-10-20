import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CommandHistory } from "../../core/CommandHistory"
import { EditorBridge } from "../../core/EditorBridge"
import { StyleManager } from "../StyleManager"
import { TextStyleManager } from "../TextStyleManager"
import { getEditableTextContent, setElementTextContent } from "../../utils/textContent"
import { markSourceNodes, removeRuntimeNodes } from "../../utils/sourceNodes"

describe("inline text styling", () => {
	let manager: StyleManager
	beforeEach(() => {
		manager = new StyleManager(new CommandHistory())
	})
	afterEach(() => {
		window.getSelection()?.removeAllRanges()
		document.body.innerHTML = ""
		document.documentElement.removeAttribute("data-magic-source-node")
		vi.restoreAllMocks()
	})

	it("keeps inline markup and surrounding text when updating a nested text run", () => {
		document.body.innerHTML =
			'<span id="line">体感温度 <mark><span style="color: red">37°C</span></mark> · 高温</span>'
		const line = document.getElementById("line")!
		const mark = line.querySelector("mark")!
		setElementTextContent(line, "体感温度 36°C · 高温")
		expect(line.textContent).toBe("体感温度 36°C · 高温")
		expect(line.querySelector("mark")).toBe(mark)
		expect(line.querySelector("span")?.style.color).toBe("red")
		expect(mark.textContent).toBe("36°C")
	})

	it("does not move unchanged direct text around a highlighted child", () => {
		document.body.innerHTML = '<p id="line">多云 <mark>雷阵雨</mark>、局部大雨</p>'
		const line = document.getElementById("line")!
		const original = line.innerHTML
		setElementTextContent(line, getEditableTextContent(line))
		expect(line.innerHTML).toBe(original)
		setElementTextContent(line, "阴天 、局部大雨")
		expect(line.innerHTML).toBe("阴天 <mark>雷阵雨</mark>、局部大雨")
	})

	it.each(["setTextContent", "updateTextContent"] as const)(
		"restores exact inline structure for %s history",
		async (method) => {
			document.body.innerHTML =
				'<span id="line">温度 <strong style="color:red">37°C</strong> · 高温</span>'
			const line = document.getElementById("line")!
			const original = line.innerHTML
			await manager[method]("#line", "温度 36°C · 高温")
			const updated = line.innerHTML
			expect(line.querySelector("strong")?.textContent).toBe("36°C")
			await manager.undo()
			expect(line.innerHTML).toBe(original)
			await manager.redo()
			expect(line.innerHTML).toBe(updated)
		},
	)

	it("records rich text edits as HTML and keeps them when serializing after undo/redo", async () => {
		document.body.innerHTML = '<p id="line">温度 <span style="color:red">37°C</span> · 高温</p>'
		markSourceNodes(document)
		const line = document.getElementById("line")!
		const original = line.innerHTML
		manager.enableTextEditing("#line")
		line.querySelector("span")!.firstChild!.textContent = "36°C"
		line.querySelector("span")!.style.backgroundColor = "yellow"
		const updated = line.innerHTML
		manager.disableTextEditing("#line")
		expect(line.hasAttribute("contenteditable")).toBe(false)
		await manager.undo()
		expect(line.innerHTML).toBe(original)
		await manager.redo()
		expect(line.innerHTML).toBe(updated)
		const saved = new DOMParser().parseFromString(
			document.documentElement.outerHTML,
			"text/html",
		)
		removeRuntimeNodes(saved)
		expect(saved.querySelector("#line span")?.textContent).toBe("36°C")
	})

	it("records a markup-only edit even when plain text is unchanged", async () => {
		document.body.innerHTML = '<p id="line">温度 <span style="color:red">37°C</span></p>'
		const line = document.getElementById("line")!
		const original = line.innerHTML
		manager.enableTextEditing("#line")
		line.querySelector("span")!.style.color = "blue"
		manager.disableTextEditing("#line")
		await manager.undo()
		expect(line.innerHTML).toBe(original)
	})

	it("restores the original run boundaries after replacing all direct text", async () => {
		document.body.innerHTML = '<p id="line">多云 <mark>雷阵雨</mark>、局部大雨</p>'
		const line = document.getElementById("line")!
		const original = line.innerHTML
		await manager.setTextContent("#line", "阴天")
		await manager.undo()
		expect(line.innerHTML).toBe(original)
	})

	it("uses a unique selector for a highlighted span among same-tag siblings", async () => {
		document.body.innerHTML =
			'<p contenteditable="true"><span>26</span><span style="color:red">37</span></p>'
		const line = document.querySelector("p")!
		const highlighted = line.lastElementChild as HTMLElement
		Object.defineProperty(Range.prototype, "getClientRects", {
			configurable: true,
			value: () => [],
		})
		const bridge = new EditorBridge()
		vi.spyOn(bridge, "sendEvent").mockImplementation(() => {})
		const history = new CommandHistory()
		const textManager = new TextStyleManager(history, bridge)
		const styleManager = new StyleManager(history)
		styleManager.setTextStyleManager(textManager)
		textManager.startMonitoring()
		try {
			const range = document.createRange()
			range.selectNodeContents(highlighted)
			window.getSelection()!.addRange(range)
			document.dispatchEvent(new Event("selectionchange"))
			await textManager.applyTextStyle(
				textManager.getTextSelection().range!.containerSelector,
				{ color: "blue" },
			)
			await styleManager.undo()
			expect((line.firstElementChild as HTMLElement).style.color).toBe("")
			expect(highlighted.style.color).toBe("red")
			await styleManager.redo()
			expect(highlighted.style.color).toBe("blue")
		} finally {
			textManager.stopMonitoring()
		}
	})

	it("uses the explicit editable root and restores only the styled span", async () => {
		document.body.innerHTML =
			'<p id="line" contenteditable="true">温度 <span style="color:red !important">37°C</span> · 高温</p>'
		const line = document.getElementById("line")!
		const span = line.querySelector("span")!
		// jsdom does not implement contenteditable inheritance; emulate the browser getter.
		Object.defineProperty(span, "isContentEditable", { configurable: true, value: true })
		Object.defineProperty(line, "isContentEditable", { configurable: true, value: true })
		Object.defineProperty(Range.prototype, "getClientRects", {
			configurable: true,
			value: () => [],
		})
		const bridge = new EditorBridge()
		vi.spyOn(bridge, "sendEvent").mockImplementation(() => {})
		const history = new CommandHistory()
		const textManager = new TextStyleManager(history, bridge)
		const styleManager = new StyleManager(history)
		styleManager.setTextStyleManager(textManager)
		textManager.startMonitoring()
		const range = document.createRange()
		range.selectNodeContents(span)
		window.getSelection()!.addRange(range)
		document.dispatchEvent(new Event("selectionchange"))
		const selector = textManager.getTextSelection().range!.containerSelector
		expect(document.querySelector(selector)).toBe(line)
		await textManager.applyTextStyle(selector, { color: "blue" })
		expect(line.style.color).toBe("")
		expect(span.style.color).toBe("blue")
		await styleManager.undo()
		expect(line.style.color).toBe("")
		expect(line.querySelector("span")!.style.getPropertyPriority("color")).toBe("important")
		await styleManager.redo()
		expect(line.style.color).toBe("")
		expect(line.querySelector("span")!.style.color).toBe("blue")
		textManager.stopMonitoring()
	})

	it("applies color across existing inline colors and restores their original markup", async () => {
		document.body.innerHTML =
			'<p id="line" contenteditable="true">多云 <span style="color:red !important">有雷阵雨</span>、局部大雨</p>'
		const line = document.getElementById("line")!
		const original = line.innerHTML
		Object.defineProperty(Range.prototype, "getClientRects", {
			configurable: true,
			value: () => [],
		})
		const bridge = new EditorBridge()
		vi.spyOn(bridge, "sendEvent").mockImplementation(() => {})
		const history = new CommandHistory()
		const textManager = new TextStyleManager(history, bridge)
		const styleManager = new StyleManager(history)
		styleManager.setTextStyleManager(textManager)
		textManager.startMonitoring()
		try {
			const range = document.createRange()
			range.setStart(line.firstChild!, 0)
			range.setEnd(line.querySelector("span")!.firstChild!, 4)
			window.getSelection()!.addRange(range)
			document.dispatchEvent(new Event("selectionchange"))
			await textManager.applyTextStyle(
				textManager.getTextSelection().range!.containerSelector,
				{ color: "blue" },
			)
			const wrapper = line.firstElementChild as HTMLElement
			expect(wrapper.textContent).toBe("多云 有雷阵雨")
			expect((wrapper.querySelector("span") as HTMLElement).style.color).toBe("blue")
			expect(line.lastChild!.textContent).toBe("、局部大雨")
			const updated = line.innerHTML
			await styleManager.undo()
			expect(line.innerHTML).toBe(original)
			await styleManager.redo()
			expect(line.innerHTML).toBe(updated)
		} finally {
			textManager.stopMonitoring()
		}
	})
})
