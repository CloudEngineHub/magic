function htmlToPlainText(html: string): string {
	if (typeof DOMParser === "undefined") return html
	const sourceDocument = new DOMParser().parseFromString(html, "text/html")
	return sourceDocument.body.textContent?.trim() || ""
}

/**
 * Start the privileged clipboard operation immediately. The browser can await
 * promised ClipboardItem representations while HTML and external CSS are prepared.
 */
export function writeWechatHtmlToClipboard(resolveHtml: () => Promise<string>): Promise<void> {
	if (
		typeof navigator === "undefined" ||
		!navigator.clipboard?.write ||
		typeof ClipboardItem === "undefined"
	) {
		throw new Error("htmlClipboardUnsupported")
	}

	let resolveDeferredHtml!: (html: string) => void
	let rejectDeferredHtml!: (error: unknown) => void
	const html = new Promise<string>((resolve, reject) => {
		resolveDeferredHtml = resolve
		rejectDeferredHtml = reject
	})
	const clipboardWrite = navigator.clipboard.write([
		new ClipboardItem({
			"text/html": html.then((value) => new Blob([value], { type: "text/html" })),
			"text/plain": html.then(
				(value) => new Blob([htmlToPlainText(value)], { type: "text/plain" }),
			),
		}),
	])

	void Promise.resolve().then(resolveHtml).then(resolveDeferredHtml, rejectDeferredHtml)
	return clipboardWrite
}
