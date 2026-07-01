import { log, LogLevel } from "../logger"
import type { PackagePresentationInput } from "../ir/serialize"
import { drawByRegistry } from "../registry/drawer-registry"
import { createPresentation, ensureFileName } from "./pptx-document"

export async function packagePresentationInWorker({
	config,
	fileName,
	slides,
	slideBackgrounds,
}: PackagePresentationInput & {
	signal: AbortSignal
}): Promise<void> {
	const pres = createPresentation(config)

	for (let index = 0; index < slides.length; index++) {
		const slide = pres.addSlide()
		const background = slideBackgrounds?.[index]
		if (background) slide.background = { color: background }
		for (const node of slides[index]) {
			await drawByRegistry(slide, node)
		}
	}

	log(LogLevel.L2, "开始在主线程打包 PPT", {
		slideCount: slides.length,
	})
	await pres.writeFile({ fileName: ensureFileName(fileName) })
}
