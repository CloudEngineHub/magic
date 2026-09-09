import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MarkdownPreview from "./MarkdownPreview"

vi.mock("@/models/config/hooks", () => ({
	useTheme: () => ({ prefersColorScheme: "light" }),
}))

describe("MarkdownPreview", () => {
	it("waits for attachment readiness and unsubscribes on unmount", async () => {
		let ready = false
		let notify = () => undefined as void
		const unsubscribe = vi.fn()
		const urlResolver = Object.assign(
			vi.fn(async () => "/resolved.png"),
			{
				isReady: () => ready,
				subscribe: (listener: () => void) => {
					notify = listener
					return unsubscribe
				},
			},
		)
		const { unmount } = render(
			<MarkdownPreview
				content={'![photo](./photo.jpg "=48x32")'}
				urlResolver={urlResolver}
			/>,
		)
		const img = screen.getByRole("img", { name: "photo" })
		expect(img).not.toHaveAttribute("src")
		expect(img).toHaveAttribute("width", "48")
		expect(urlResolver).not.toHaveBeenCalled()
		await act(async () => {
			ready = true
			notify()
		})
		expect(img).toHaveAttribute("src", "/resolved.png")
		unmount()
		expect(unsubscribe).toHaveBeenCalledOnce()
	})
	it("waits for the variant without requesting the original and falls back on image failure", async () => {
		let resolve!: (url: string) => void
		const urlResolver = () =>
			new Promise<string>((done) => {
				resolve = done
			})
		render(
			<MarkdownPreview
				content="![photo](https://example.com/original.jpg)"
				urlResolver={urlResolver}
			/>,
		)
		const img = screen.getByRole("img", { name: "photo" })
		expect(img).not.toHaveAttribute("src")
		await waitFor(() => expect(resolve).toBeDefined())
		resolve("https://example.com/thumbnail.webp")
		await waitFor(() =>
			expect(img).toHaveAttribute("src", "https://example.com/thumbnail.webp"),
		)
		fireEvent.error(img)
		expect(img).toHaveAttribute("src", "https://example.com/original.jpg")
	})

	it("falls back when a resolver throws synchronously", async () => {
		render(
			<MarkdownPreview
				content="![photo](/original.jpg)"
				urlResolver={() => {
					throw new Error("unavailable")
				}}
			/>,
		)
		await waitFor(() =>
			expect(screen.getByRole("img", { name: "photo" })).toHaveAttribute(
				"src",
				"/original.jpg",
			),
		)
	})
	it("renders sanitized markdown, heading anchors, resolved images, and link callbacks", async () => {
		const onLinkClick = vi.fn(() => true)
		const urlResolver = vi.fn(async (path: string) => `resolved:${path}`)

		render(
			<MarkdownPreview
				content={
					'# Release notes\n\n<script>alert("xss")</script>\n\n[Jump](#release-notes)\n\n![Logo](/logo.png)'
				}
				urlResolver={urlResolver}
				onLinkClick={onLinkClick}
			/>,
		)

		expect(screen.getByTestId("markdown-preview")).toBeInTheDocument()
		expect(screen.getByRole("heading", { name: "Release notes" })).toHaveAttribute(
			"id",
			"release-notes",
		)
		expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument()

		await waitFor(() =>
			expect(screen.getByRole("img", { name: "Logo" })).toHaveAttribute(
				"src",
				"resolved:/logo.png",
			),
		)

		fireEvent.click(screen.getByRole("link", { name: "Jump" }))
		expect(onLinkClick).toHaveBeenCalledOnce()
	})

	it("keeps markdown image size metadata when resolving a URL", async () => {
		const urlResolver = vi.fn(async (path: string) => `resolved:${path}`)

		render(
			<MarkdownPreview
				content={'![avatar](./avatar.jpg "=48x32")'}
				urlResolver={urlResolver}
			/>,
		)

		await waitFor(() => expect(urlResolver).toHaveBeenCalledWith("./avatar.jpg =48x32"))
	})
})
