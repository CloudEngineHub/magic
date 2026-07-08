import { log, LogLevel } from "../logger"
import type { PackagePresentationInput } from "../ir/serialize"
import { drawByRegistry } from "../registry/drawer-registry"
import { throwIfAborted } from "../sandbox/abort"
import { createPresentation, ensureFileName } from "./pptx-document"

export async function packagePresentationInWorker({
	config,
	fileName,
	slides,
	slideBackgrounds,
	signal,
}: PackagePresentationInput & {
	signal: AbortSignal
}): Promise<void> {
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
	await pres.writeFile({ fileName: ensureFileName(fileName) })
}
