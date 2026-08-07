import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import PureShareHTMLRenderer from "../PureShareHTMLRenderer"

describe("PureShareHTMLRenderer", () => {
	afterEach(() => {
		document.head
			.querySelectorAll("[data-magic-pure-share-runtime]")
			.forEach((node) => node.remove())
		document.documentElement.removeAttribute("data-preview-theme")
		document.body.removeAttribute("data-preview-page")
	})

	it("mounts HTML into the host document and restores document attributes on cleanup", () => {
		const originalBodyClass = document.body.getAttribute("class")
		const { unmount } = render(
			<PureShareHTMLRenderer
				content={`<!DOCTYPE html>
<html data-preview-theme="light">
<head><style id="preview-style">.preview-card { color: red; }</style></head>
<body data-preview-page="true" class="preview-body">
<main class="preview-card">Preview content</main>
</body>
</html>`}
			/>,
		)

		const host = screen.getByTestId("pure-share-html-renderer")
		expect(host).toBeInTheDocument()
		expect(document.body.querySelector(".preview-card")).toHaveTextContent("Preview content")
		expect(document.head.querySelector("#preview-style")).not.toBeNull()
		expect(document.documentElement).toHaveAttribute("data-preview-theme", "light")
		expect(document.body).toHaveAttribute("data-preview-page", "true")

		unmount()

		expect(document.head.querySelector("#preview-style")).toBeNull()
		expect(document.documentElement).not.toHaveAttribute("data-preview-theme")
		expect(document.body).not.toHaveAttribute("data-preview-page")
		expect(document.body.getAttribute("class")).toBe(originalBodyClass)
		expect(document.body.querySelector(".preview-card")).toBeNull()
	})

	it("recreates inert scripts as executable host-document scripts", () => {
		const requestAnimationFrame = vi
			.spyOn(window, "requestAnimationFrame")
			.mockImplementation((callback) => {
				callback(0)
				return 1
			})

		render(
			<PureShareHTMLRenderer content="<html><body><script>window.__PURE_SHARE_TEST__ = true</script></body></html>" />,
		)

		expect(
			document.body.querySelector('script[data-magic-pure-share-runtime="script"]'),
		).not.toBeNull()
		requestAnimationFrame.mockRestore()
	})

	it("renames a conflicting application root while shared HTML is mounted", () => {
		const appRoot = document.createElement("div")
		appRoot.id = "root"
		const mountTarget = document.createElement("div")
		appRoot.appendChild(mountTarget)
		document.body.appendChild(appRoot)

		const { unmount } = render(
			<PureShareHTMLRenderer content='<html><body><main id="root">Shared root</main></body></html>' />,
			{ container: mountTarget },
		)

		expect(appRoot.id).toBe("magic-pure-share-application-root")
		expect(document.getElementById("root")).toHaveTextContent("Shared root")

		unmount()
		expect(appRoot.id).toBe("root")
		appRoot.remove()
	})
})
