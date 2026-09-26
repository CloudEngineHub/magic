import puppeteer from "puppeteer"
import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { serveFixtures } from "./serve-fixtures"
import { outputRoot } from "./build-fixtures"

const { server, url } = await serveFixtures()
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined
try {
	browser = await puppeteer.launch({
		headless: true,
		...(process.env.HTML_SANDBOX_CHROME
			? { executablePath: process.env.HTML_SANDBOX_CHROME }
			: existsSync(puppeteer.executablePath())
				? {}
				: { channel: "chrome" as const }),
	})
	const page = await browser.newPage()
	const errors: string[] = []
	page.on("pageerror", (error) => errors.push(String(error)))
	// Fail closed: fixtures must not accidentally reach a real backend/CDN.
	await page.setRequestInterception(true)
	page.on("request", (request) => {
		const address = new URL(request.url())
		if (
			["data:", "blob:", "about:"].includes(address.protocol) ||
			(address.port === new URL(url).port &&
				["127.0.0.1", "localhost"].includes(address.hostname))
		)
			void request.continue()
		else {
			errors.push("Unexpected external request: " + address.origin)
			void request.abort()
		}
	})
	await page.goto(url + "/?autorun", { waitUntil: "domcontentloaded" })
	await page.waitForFunction("window.fixtureDone === true", { timeout: 180000 })
	const results = (await page.evaluate("window.fixtureResults")) as Array<{
		name: string
		passed: boolean
		error?: string
	}>
	if (!Array.isArray(results) || results.length === 0)
		throw Error("No browser assertions executed")
	const failures = results.filter((result) => !result.passed)
	const trace = await page.$eval("#trace", (element) => element.textContent)
	await writeFile(
		resolve(outputRoot, "browser-results.json"),
		JSON.stringify({ results, errors, trace: JSON.parse(trace || "[]") }, null, 2),
	)
	for (const failure of failures) console.error("FAIL", failure.name, failure.error || "")
	for (const error of errors) console.error("BROWSER ERROR", error)
	console.log(`Browser: ${results.length - failures.length}/${results.length} assertions passed`)
	if (failures.length || errors.length) process.exitCode = 1
} finally {
	await browser?.close()
	server.closeAllConnections()
	await new Promise<void>((done) => server.close(() => done()))
}
