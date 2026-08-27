import { afterEach, describe, expect, it } from "vitest"
import { buildDomTree, resetEditorNodeIds } from "../domTree"

describe("domTree", () => {
	afterEach(() => {
		resetEditorNodeIds(document.body)
		document.body.replaceChildren()
	})

	it("only exposes text previews for leaf elements", () => {
		document.body.innerHTML = `
			<section class="card">
				<div class="content">
					<p>Final text</p>
				</div>
			</section>
		`

		const tree = buildDomTree()
		const section = tree.root.children[0]
		const container = section.children[0]
		const paragraph = container.children[0]

		expect(section.textContent).toBeUndefined()
		expect(container.textContent).toBeUndefined()
		expect(paragraph.textContent).toBe("Final text")
	})

	it("ignores injected children when collecting direct text", () => {
		document.body.innerHTML = `
			<p>
				Visible text
				<span data-injected="true">Editor control</span>
			</p>
		`

		const tree = buildDomTree()
		const paragraph = tree.root.children[0]

		expect(paragraph.children).toHaveLength(0)
		expect(paragraph.textContent).toBe("Visible text")
	})

	it("keeps direct text visible for containers with element children", () => {
		document.body.innerHTML = `
			<div class="mixed">
				Prefix
				<strong>emphasis</strong>
				Suffix
			</div>
		`

		const tree = buildDomTree()
		const mixed = tree.root.children[0]

		expect(mixed.textContent).toBe("Prefix Suffix")
		expect(mixed.children[0].textContent).toBe("emphasis")
	})

	it("keeps the body selectable while root structure operations stay disabled", () => {
		const tree = buildDomTree()

		expect(tree.root.tagName).toBe("body")
		expect(tree.root.canSelect).toBe(true)
		expect(tree.root.editable).toBe(false)
		expect(tree.root.canMove).toBe(false)
		expect(tree.root.canDelete).toBe(false)
	})
})
