import { log, LogLevel } from "../logger"
import type { PackagePresentationInput } from "../ir/serialize"
import type { GeneratedPPTX, ResourceLoadError } from "../api/options"
import { drawByRegistry } from "../registry/drawer-registry"
import { throwIfAborted } from "../sandbox/abort"
import { createPresentation, ensureFileName } from "./pptx-document"

export async function packagePresentationInWorker({
	config,
	fileName,
	slides,
	slideBackgrounds,
	signal,
	onResourceError,
	download = true,
}: PackagePresentationInput & {
	signal: AbortSignal
	onResourceError?: (error: ResourceLoadError) => void
	download?: boolean
}): Promise<GeneratedPPTX | void> {
	void onResourceError
	const pres = createPresentation(config)

	for (let index = 0; index < slides.length; index++) {
		throwIfAborted(signal)
		const slide = pres.addSlide()
		const background = slideBackgrounds?.[index]
		if (background) slide.background = { color: background }
		for (const node of slides[index]) {
			throwIfAborted(signal)
			await drawByRegistry(slide, node, signal)
		}
	}

	log(LogLevel.L2, "开始在主线程打包 PPT", {
		slideCount: slides.length,
	})
	throwIfAborted(signal)
	const outputFileName = ensureFileName(fileName)
	if (download) {
		await pres.writeFile({ fileName: outputFileName })
		return
	}

	const output = await pres.write({ outputType: "blob" })
	throwIfAborted(signal)
	// pptxgenjs reports generated PPTX blobs as application/zip. Re-wrap the payload so
	// callers of generatePPTX receive the same MIME type in OSS and enterprise builds.
	const data = new Blob([output as BlobPart], {
		type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	})
	return { data, fileName: outputFileName }
}
