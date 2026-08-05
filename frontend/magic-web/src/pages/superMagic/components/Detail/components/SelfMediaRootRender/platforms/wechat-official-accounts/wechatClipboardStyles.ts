const ABSOLUTE_CSS_URL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i
const CSS_URL_PATTERN = /url\(\s*(?:(['"])([\s\S]*?)\1|([^)]*))\s*\)/gi
const STYLESHEET_MARKER_ATTRIBUTE = "data-wechat-external-stylesheet"

const MAX_STYLESHEET_RESOURCES = 12
const MAX_STYLESHEET_CONCURRENCY = 4
const MAX_STYLESHEET_BYTES = 512 * 1024
const MAX_TOTAL_STYLESHEET_BYTES = 1024 * 1024
const MAX_STYLESHEET_IMPORT_DEPTH = 4
const STYLESHEET_REQUEST_TIMEOUT_MS = 8_000

export interface PreparedWechatStylesheet {
	cssText: string
	media: string | null
	markerIndex: number
}

interface CssImport {
	end: number
	media: string
	start: number
	url: string
}

interface StylesheetPreparationContext {
	deadline: number
	fetchLimiter: ReturnType<typeof createConcurrencyLimiter>
	resourceCount: number
	totalBytes: number
}

interface FetchedStylesheet {
	cssText: string
	responseUrl: string
}

function createStylesheetError(message: string): Error {
	return new Error(message)
}

function isStylesheetError(error: unknown): error is Error {
	return error instanceof Error && error.message.startsWith("stylesheet")
}

function createConcurrencyLimiter(limit: number) {
	let activeCount = 0
	const waiters: Array<() => void> = []

	const acquire = async (): Promise<void> => {
		if (activeCount < limit) {
			activeCount += 1
			return
		}
		await new Promise<void>((resolve) => waiters.push(resolve))
		activeCount += 1
	}

	const release = (): void => {
		activeCount -= 1
		waiters.shift()?.()
	}

	return async <T>(task: () => Promise<T>): Promise<T> => {
		await acquire()
		try {
			return await task()
		} finally {
			release()
		}
	}
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length)
	let nextIndex = 0
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (nextIndex < items.length) {
			const index = nextIndex
			nextIndex += 1
			results[index] = await mapper(items[index], index)
		}
	})
	await Promise.all(workers)
	return results
}

function rewriteCssResourceUrls(cssText: string, stylesheetUrl: string): string {
	return cssText.replace(
		CSS_URL_PATTERN,
		(match, quote: string, quotedUrl: string, unquotedUrl: string) => {
			const resourceUrl = (quote ? quotedUrl : unquotedUrl).trim()
			if (!resourceUrl || ABSOLUTE_CSS_URL_PATTERN.test(resourceUrl)) return match

			try {
				const resolvedUrl = new URL(resourceUrl, stylesheetUrl).href
					.replace(/\(/g, "%28")
					.replace(/\)/g, "%29")
				const nextQuote = quote || '"'
				return `url(${nextQuote}${resolvedUrl}${nextQuote})`
			} catch {
				return match
			}
		},
	)
}

function skipWhitespaceAndComments(value: string, start: number): number {
	let index = start
	while (index < value.length) {
		if (/\s/.test(value[index])) {
			index += 1
			continue
		}
		if (value[index] === "/" && value[index + 1] === "*") {
			const commentEnd = value.indexOf("*/", index + 2)
			if (commentEnd < 0) return value.length
			index = commentEnd + 2
			continue
		}
		break
	}
	return index
}

function readCssString(value: string, start: number): { end: number; value: string } | null {
	const quote = value[start]
	if (quote !== '"' && quote !== "'") return null
	let result = ""
	for (let index = start + 1; index < value.length; index += 1) {
		const character = value[index]
		if (character === "\\" && index + 1 < value.length) {
			result += value[index + 1]
			index += 1
			continue
		}
		if (character === quote) return { end: index + 1, value: result }
		result += character
	}
	return null
}

function parseCssImportPrelude(prelude: string): { media: string; url: string } | null {
	let index = skipWhitespaceAndComments(prelude, 0)
	let parsedUrl: { end: number; value: string } | null = null

	if (prelude[index] === '"' || prelude[index] === "'") {
		parsedUrl = readCssString(prelude, index)
	} else if (prelude.slice(index, index + 4).toLowerCase() === "url(") {
		index = skipWhitespaceAndComments(prelude, index + 4)
		if (prelude[index] === '"' || prelude[index] === "'") {
			const quotedUrl = readCssString(prelude, index)
			if (!quotedUrl) return null
			index = skipWhitespaceAndComments(prelude, quotedUrl.end)
			if (prelude[index] !== ")") return null
			parsedUrl = { end: index + 1, value: quotedUrl.value }
		} else {
			const closingParen = prelude.indexOf(")", index)
			if (closingParen < 0) return null
			parsedUrl = {
				end: closingParen + 1,
				value: prelude.slice(index, closingParen).trim(),
			}
		}
	}

	if (!parsedUrl?.value) return null
	const media = prelude.slice(parsedUrl.end).trim()
	// `layer()` and `supports()` need their own cascade semantics. Failing is
	// safer than silently producing clipboard HTML with different styling.
	if (/^(?:layer|supports)(?:\s|\()/i.test(media)) return null
	return { media, url: parsedUrl.value }
}

function findCssImports(cssText: string): CssImport[] {
	const imports: CssImport[] = []
	let braceDepth = 0
	let index = 0
	let quote = ""
	let inComment = false

	while (index < cssText.length) {
		const character = cssText[index]
		if (inComment) {
			if (character === "*" && cssText[index + 1] === "/") {
				inComment = false
				index += 2
				continue
			}
			index += 1
			continue
		}
		if (quote) {
			if (character === "\\") index += 2
			else {
				if (character === quote) quote = ""
				index += 1
			}
			continue
		}
		if (character === "/" && cssText[index + 1] === "*") {
			inComment = true
			index += 2
			continue
		}
		if (character === '"' || character === "'") {
			quote = character
			index += 1
			continue
		}
		if (character === "{") braceDepth += 1
		if (character === "}") braceDepth = Math.max(0, braceDepth - 1)

		if (
			braceDepth === 0 &&
			cssText.slice(index, index + 7).toLowerCase() === "@import" &&
			/[\s'"]/.test(cssText[index + 7] || "")
		) {
			let end = index + 7
			let importQuote = ""
			let parenDepth = 0
			let importComment = false
			for (; end < cssText.length; end += 1) {
				const importCharacter = cssText[end]
				if (importComment) {
					if (importCharacter === "*" && cssText[end + 1] === "/") {
						importComment = false
						end += 1
					}
					continue
				}
				if (importQuote) {
					if (importCharacter === "\\") end += 1
					else if (importCharacter === importQuote) importQuote = ""
					continue
				}
				if (importCharacter === "/" && cssText[end + 1] === "*") {
					importComment = true
					end += 1
					continue
				}
				if (importCharacter === '"' || importCharacter === "'")
					importQuote = importCharacter
				else if (importCharacter === "(") parenDepth += 1
				else if (importCharacter === ")") parenDepth = Math.max(0, parenDepth - 1)
				else if (importCharacter === ";" && parenDepth === 0) break
			}

			if (end >= cssText.length) throw createStylesheetError("stylesheetImportUnsupported")
			const parsedImport = parseCssImportPrelude(cssText.slice(index + 7, end))
			if (!parsedImport) throw createStylesheetError("stylesheetImportUnsupported")
			imports.push({ end: end + 1, start: index, ...parsedImport })
			index = end + 1
			continue
		}
		index += 1
	}

	return imports
}

export function hasTopLevelCssImport(cssText: string): boolean {
	return findCssImports(cssText).length > 0
}

function reserveStylesheetResource(context: StylesheetPreparationContext): void {
	context.resourceCount += 1
	if (context.resourceCount > MAX_STYLESHEET_RESOURCES) {
		throw createStylesheetError("stylesheetResourceLimitExceeded")
	}
}

function addStylesheetBytes(context: StylesheetPreparationContext, byteLength: number): void {
	context.totalBytes += byteLength
	if (context.totalBytes > MAX_TOTAL_STYLESHEET_BYTES) {
		throw createStylesheetError("stylesheetResourceLimitExceeded")
	}
}

async function readStylesheetResponse(
	response: Response,
	context: StylesheetPreparationContext,
): Promise<string> {
	const declaredLength = Number(response.headers?.get("content-length"))
	if (
		Number.isFinite(declaredLength) &&
		(declaredLength > MAX_STYLESHEET_BYTES ||
			context.totalBytes + declaredLength > MAX_TOTAL_STYLESHEET_BYTES)
	) {
		throw createStylesheetError("stylesheetResourceLimitExceeded")
	}

	const reader = response.body?.getReader()
	if (!reader) {
		const cssText = await response.text()
		const byteLength = new TextEncoder().encode(cssText).byteLength
		if (byteLength > MAX_STYLESHEET_BYTES) {
			throw createStylesheetError("stylesheetResourceLimitExceeded")
		}
		addStylesheetBytes(context, byteLength)
		return cssText
	}

	const decoder = new TextDecoder()
	let cssText = ""
	let stylesheetBytes = 0
	try {
		let readResult = await reader.read()
		while (!readResult.done) {
			const { value } = readResult
			stylesheetBytes += value.byteLength
			if (stylesheetBytes > MAX_STYLESHEET_BYTES) {
				throw createStylesheetError("stylesheetResourceLimitExceeded")
			}
			addStylesheetBytes(context, value.byteLength)
			cssText += decoder.decode(value, { stream: true })
			readResult = await reader.read()
		}
	} catch (error) {
		await reader.cancel()
		throw error
	}
	return cssText + decoder.decode()
}

async function fetchStylesheetText(
	stylesheetUrl: string,
	context: StylesheetPreparationContext,
): Promise<FetchedStylesheet> {
	reserveStylesheetResource(context)
	return context.fetchLimiter(async () => {
		const remainingTime = context.deadline - Date.now()
		if (remainingTime <= 0) throw createStylesheetError("stylesheetLoadFailed")
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), remainingTime)
		try {
			const response = await fetch(stylesheetUrl, {
				credentials: "omit",
				signal: controller.signal,
			})
			if (!response.ok) throw createStylesheetError("stylesheetLoadFailed")
			return {
				cssText: await readStylesheetResponse(response, context),
				responseUrl: response.url || stylesheetUrl,
			}
		} catch (error) {
			if (isStylesheetError(error)) throw error
			throw createStylesheetError("stylesheetLoadFailed")
		} finally {
			clearTimeout(timeoutId)
		}
	})
}

async function expandStylesheetImports(
	stylesheetUrl: string,
	context: StylesheetPreparationContext,
	ancestry: string[],
	depth = 0,
): Promise<string> {
	if (ancestry.includes(stylesheetUrl)) {
		throw createStylesheetError("stylesheetImportCycle")
	}
	if (depth > MAX_STYLESHEET_IMPORT_DEPTH) {
		throw createStylesheetError("stylesheetImportDepthExceeded")
	}

	const { cssText, responseUrl } = await fetchStylesheetText(stylesheetUrl, context)
	if (responseUrl !== stylesheetUrl && ancestry.includes(responseUrl)) {
		throw createStylesheetError("stylesheetImportCycle")
	}
	const imports = findCssImports(cssText)
	if (!imports.length) return rewriteCssResourceUrls(cssText, responseUrl)

	const nextAncestry = Array.from(new Set([...ancestry, stylesheetUrl, responseUrl]))
	const expandedImports = await Promise.all(
		imports.map(async (cssImport) => {
			let importedUrl: string
			try {
				importedUrl = new URL(cssImport.url, responseUrl).href
			} catch {
				throw createStylesheetError("stylesheetImportUnsupported")
			}
			const importedCss = await expandStylesheetImports(
				importedUrl,
				context,
				nextAncestry,
				depth + 1,
			)
			if (!cssImport.media || cssImport.media.toLowerCase() === "all") return importedCss
			return `@media ${cssImport.media} {\n${importedCss}\n}`
		}),
	)

	let expandedCss = ""
	let cursor = 0
	imports.forEach((cssImport, index) => {
		expandedCss += cssText.slice(cursor, cssImport.start)
		expandedCss += expandedImports[index]
		cursor = cssImport.end
	})
	expandedCss += cssText.slice(cursor)
	return rewriteCssResourceUrls(expandedCss, responseUrl)
}

export async function prepareWechatExternalStylesheets(
	sourceDocument: Document,
): Promise<PreparedWechatStylesheet[]> {
	const stylesheets = Array.from(
		sourceDocument.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet'][href]"),
	)
	if (!stylesheets.length) return []
	if (stylesheets.length > MAX_STYLESHEET_RESOURCES) {
		throw createStylesheetError("stylesheetResourceLimitExceeded")
	}

	const context: StylesheetPreparationContext = {
		deadline: Date.now() + STYLESHEET_REQUEST_TIMEOUT_MS,
		fetchLimiter: createConcurrencyLimiter(MAX_STYLESHEET_CONCURRENCY),
		resourceCount: 0,
		totalBytes: 0,
	}
	const preparedStylesheets = await mapWithConcurrency(
		stylesheets,
		MAX_STYLESHEET_CONCURRENCY,
		async (stylesheet, markerIndex) => ({
			cssText: await expandStylesheetImports(stylesheet.href, context, []),
			media: stylesheet.getAttribute("media"),
			markerIndex,
		}),
	)

	stylesheets.forEach((stylesheet, markerIndex) => {
		const marker = sourceDocument.createElement("meta")
		marker.setAttribute(STYLESHEET_MARKER_ATTRIBUTE, String(markerIndex))
		stylesheet.replaceWith(marker)
	})

	return preparedStylesheets
}

export function injectWechatExternalStylesheets(
	sourceDocument: Document,
	stylesheets: PreparedWechatStylesheet[],
): void {
	stylesheets.forEach(({ cssText, media, markerIndex }) => {
		const marker = sourceDocument.querySelector(
			`[${STYLESHEET_MARKER_ATTRIBUTE}="${markerIndex}"]`,
		)
		if (!marker) return

		// CSS is inserted only after iframe parsing so `</style>` in an external
		// response remains text and cannot escape into executable HTML nodes.
		const styleElement = sourceDocument.createElement("style")
		if (media) styleElement.setAttribute("media", media)
		styleElement.textContent = cssText
		marker.replaceWith(styleElement)
	})
}
