import { existsSync, mkdirSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import puppeteer from "puppeteer"

const CARD_WIDTH = 540
const CARD_HEIGHT = 675
const PAGE_GAP = 18
const PAGE_PADDING = 20

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(currentDir, "..")
const repoRoot = path.resolve(frontendRoot, "../..")
const presetRoot = path.join(
	repoRoot,
	"backend/super-magic/agents/skills/self-media-composer/presets",
)
const outputRoot = path.join(frontendRoot, "public/self-media-preset-previews")
const CHROME_EXECUTABLE_CANDIDATES = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium-browser",
]

function getLocalChromeExecutable() {
	return CHROME_EXECUTABLE_CANDIDATES.find((candidate) => existsSync(candidate))
}

function discoverTargets() {
	return readdirSync(presetRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((platformEntry) => {
			const platform = platformEntry.name
			const platformPath = path.join(presetRoot, platform)
			return readdirSync(platformPath, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((presetEntry) => `${platform}/${presetEntry.name}`)
				.filter((target) => {
					const [targetPlatform, targetPreset] = target.split("/")
					return existsSync(
						path.join(presetRoot, targetPlatform, targetPreset, "preview.html"),
					)
				})
		})
		.sort()
}

function parseTargets(argv) {
	const requested = argv.filter((arg) => !arg.startsWith("-"))
	return requested.length ? requested : discoverTargets()
}

function resolveTarget(target) {
	const [platform, preset, extra] = target.split("/")
	if (!platform || !preset || extra) {
		throw new Error(
			`Invalid target "${target}". Use "platform/preset", e.g. rednote/paper-column.`,
		)
	}

	const previewPath = path.join(presetRoot, platform, preset, "preview.html")
	if (!existsSync(previewPath)) {
		throw new Error(`Preview HTML not found: ${path.relative(repoRoot, previewPath)}`)
	}

	return {
		outputPath: path.join(outputRoot, platform, `${preset}.png`),
		platform,
		preset,
		previewPath,
	}
}

async function waitForRemoteImages(page) {
	await page.evaluate(async () => {
		const images = Array.from(document.images)
		await Promise.all(
			images.map(
				(image) =>
					new Promise((resolve) => {
						if (image.complete) {
							resolve(undefined)
							return
						}
						const done = () => resolve(undefined)
						image.addEventListener("load", done, { once: true })
						image.addEventListener("error", done, { once: true })
						window.setTimeout(done, 2500)
					}),
			),
		)
		for (const image of images) {
			if (image.naturalWidth > 0) continue
			image.style.opacity = "0"
			image.setAttribute("data-capture-hidden-broken-image", "true")
		}
	})
}

async function captureTarget(browser, target) {
	const page = await browser.newPage()
	await page.setViewport({
		deviceScaleFactor: 2,
		height: 4200,
		width: CARD_WIDTH + PAGE_PADDING * 2,
	})
	await page.evaluateOnNewDocument(() => {
		window.echarts = {
			init: () => ({
				resize: () => undefined,
				setOption: () => undefined,
			}),
		}
	})

	const consoleMessages = []
	page.on("console", (message) => {
		if (message.type() === "error") consoleMessages.push(message.text())
	})

	const fileUrl = pathToFileURL(target.previewPath).href
	await page.goto(fileUrl, {
		timeout: 30000,
		waitUntil: "domcontentloaded",
	})
	await page.addStyleTag({
		content: `
			html,
			body {
				width: ${CARD_WIDTH + PAGE_PADDING * 2}px !important;
				height: auto !important;
				min-height: 0 !important;
				margin: 0 !important;
				overflow: visible !important;
			}

			.preview-container {
				box-sizing: border-box !important;
				display: flex !important;
				flex-direction: column !important;
				flex-wrap: nowrap !important;
				align-items: center !important;
				justify-content: flex-start !important;
				width: ${CARD_WIDTH + PAGE_PADDING * 2}px !important;
				gap: ${PAGE_GAP}px !important;
				padding: ${PAGE_PADDING}px !important;
			}

			.preview-card-wrapper {
				flex: 0 0 auto !important;
				width: ${CARD_WIDTH}px !important;
				height: ${CARD_HEIGHT}px !important;
				margin: 0 !important;
				transform: none !important;
				transform-origin: top left !important;
			}

			.preview-card-wrapper > section {
				transform: scale(0.5) !important;
				transform-origin: top left !important;
			}

			.em-photo-well,
			.sg-photo-well {
				background:
					linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(17, 17, 15, 0.12)),
					repeating-linear-gradient(45deg, rgba(17, 17, 15, 0.05) 0 8px, transparent 8px 16px) !important;
			}
		`,
	})
	await waitForRemoteImages(page)
	await page.waitForSelector(".preview-container", { timeout: 10000 })

	mkdirSync(path.dirname(target.outputPath), { recursive: true })
	const container = await page.$(".preview-container")
	if (!container) throw new Error("Missing .preview-container")
	await container.screenshot({
		animations: "disabled",
		path: target.outputPath,
		type: "png",
	})
	await page.close()

	return {
		consoleMessages,
		outputPath: target.outputPath,
		target: `${target.platform}/${target.preset}`,
	}
}

async function main() {
	const targets = parseTargets(process.argv.slice(2)).map(resolveTarget)
	const executablePath = getLocalChromeExecutable()
	const browser = await puppeteer.launch({
		args: ["--disable-dev-shm-usage", "--no-sandbox"],
		...(executablePath ? { executablePath } : {}),
		headless: true,
	})

	try {
		for (const target of targets) {
			const result = await captureTarget(browser, target)
			const relativeOutput = path.relative(repoRoot, result.outputPath)
			console.log(`captured ${result.target} -> ${relativeOutput}`)
			if (result.consoleMessages.length) {
				console.log(`  ignored console errors: ${result.consoleMessages.length}`)
			}
		}
	} finally {
		await browser.close()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
