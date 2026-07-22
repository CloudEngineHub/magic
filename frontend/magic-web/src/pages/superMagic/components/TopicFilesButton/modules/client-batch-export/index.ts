import { generatePPTX } from "@magic/html2pptx"
import { loadJSZip } from "@/lib/jszip"
import { prepareHtmlPagesForExport } from "@/utils/htmlExportPrepare"
import { isMarkdownFileName } from "@/utils/pdfFileType"
import {
	prepareExportSlides,
	prepareSingleSlideExport,
} from "@/pages/superMagic/services/pptService"
import {
	documentExportService,
	type DocumentExport,
} from "@/pages/superMagic/services/documentExport"
import type {
	ClientBatchAttachment,
	ClientBatchExportArtifact,
	ClientBatchDisplayConfig,
	ClientBatchExportFailure,
	ClientBatchExportFormat,
	ClientBatchExportRunOptions,
	ClientBatchExportRunResult,
	ClientBatchExportTarget,
} from "./types"
import { getClientBatchAppEntryFile } from "./entry"
import { isClientBatchSlideDisplayConfig } from "./selection"

export * from "./selection"
export * from "./types"

type PdfDocumentGenerator = DocumentExport.Runtime & {
	generatePages: NonNullable<DocumentExport.Runtime["generatePages"]>
	generateMarkdownFile: NonNullable<DocumentExport.Runtime["generateMarkdownFile"]>
}

function hasPdfDocumentGenerator(
	runtime: DocumentExport.Runtime | null,
): runtime is PdfDocumentGenerator {
	return Boolean(runtime?.generatePages && runtime.generateMarkdownFile)
}

function flattenAttachmentScope(items: ClientBatchAttachment[]): ClientBatchAttachment[] {
	const flattened: ClientBatchAttachment[] = []
	const stack = items.slice().reverse()
	while (stack.length > 0) {
		const item = stack.pop()
		if (!item) break
		const children = item.children || []
		// Existing preparation services recursively flatten their inputs. Removing child
		// references here keeps deep directory trees stack-safe while preserving metadata.
		flattened.push(children.length > 0 ? { ...item, children: undefined } : item)
		for (let index = children.length - 1; index >= 0; index -= 1) {
			stack.push(children[index])
		}
	}
	return flattened
}

function createAttachmentScopeResolver(attachments: ClientBatchAttachment[]) {
	const cache = new WeakMap<ClientBatchAttachment[], ClientBatchAttachment[]>()
	return (target: ClientBatchExportTarget): ClientBatchAttachment[] => {
		const source = target.attachmentScope ?? target.folderChildren ?? attachments
		const cached = cache.get(source)
		if (cached) return cached
		const flattened = flattenAttachmentScope(source)
		cache.set(source, flattened)
		return flattened
	}
}

function getDisplayConfig(item: ClientBatchAttachment): ClientBatchDisplayConfig | undefined {
	const config = item.display_config || item.metadata
	return config && typeof config === "object" ? (config as ClientBatchDisplayConfig) : undefined
}

function sanitizeFileName(fileName: string, fallback: string): string {
	const sanitized = fileName.trim().replace(/[\\/:*?"<>|]/g, "_")
	return sanitized || fallback
}

function uniqueFileName(fileName: string, usedNames: Set<string>): string {
	const safeName = sanitizeFileName(fileName, "export")
	const safeNameKey = safeName.toLowerCase()
	if (!usedNames.has(safeNameKey)) {
		usedNames.add(safeNameKey)
		return safeName
	}

	const extensionIndex = safeName.lastIndexOf(".")
	const baseName = extensionIndex > 0 ? safeName.slice(0, extensionIndex) : safeName
	const extension = extensionIndex > 0 ? safeName.slice(extensionIndex) : ""
	let suffix = 2
	let candidate = `${baseName} (${suffix})${extension}`
	while (usedNames.has(candidate.toLowerCase())) {
		suffix += 1
		candidate = `${baseName} (${suffix})${extension}`
	}
	usedNames.add(candidate.toLowerCase())
	return candidate
}

function getTargetEntryFile(target: ClientBatchExportTarget): ClientBatchAttachment {
	if (target.entryFile?.file_id) return target.entryFile
	const children = target.folderChildren || target.item.children || []
	const entry = getClientBatchAppEntryFile(children, getDisplayConfig(target.item))
	return entry || target.item
}

function getTargetDisplayConfig(
	target: ClientBatchExportTarget,
): ClientBatchDisplayConfig | undefined {
	return getDisplayConfig(target.item) || getDisplayConfig(getTargetEntryFile(target))
}

function hasHtmlSlides(slides: string[]): boolean {
	return slides.some((slide) => Boolean(slide))
}

async function prepareTargetSlides(
	target: ClientBatchExportTarget,
	attachments: ClientBatchAttachment[],
): Promise<{
	result: Awaited<ReturnType<typeof prepareSingleSlideExport>>
	displayConfig?: ClientBatchDisplayConfig
	fileId: string
	fileName?: string
}> {
	const entryFile = getTargetEntryFile(target)
	const displayConfig = getTargetDisplayConfig(target)
	const slidePaths: string[] = Array.isArray(displayConfig?.slides) ? displayConfig.slides : []
	const fileId = entryFile.file_id || target.item.file_id || ""
	const fileName = entryFile.file_name || target.item.file_name || target.item.name

	const result = slidePaths.length
		? await prepareExportSlides({
				slidePaths,
				attachmentList: attachments,
				mainFileId: fileId,
				mainFileName: fileName,
				displayConfig,
			})
		: await prepareSingleSlideExport({
				fileId,
				fileName,
				attachmentList: attachments,
			})

	return { result, displayConfig, fileId, fileName }
}

async function exportPdfTarget(options: {
	target: ClientBatchExportTarget
	attachments: ClientBatchAttachment[]
	page?: DocumentExport.PdfPageConfig
	documentExporter: PdfDocumentGenerator
	addOutput: (data: Uint8Array, fileName: string) => void
}): Promise<{ warnings: number }> {
	const { target, attachments, page, documentExporter, addOutput } = options
	const entryFile = getTargetEntryFile(target)
	const displayConfig = getTargetDisplayConfig(target)
	const isPptMode = isClientBatchSlideDisplayConfig(displayConfig)
	let warnings = 0
	const onResourceLoadError = () => {
		warnings += 1
	}

	if (!target.isSlideProject && isMarkdownFileName(entryFile.file_name || entryFile.name)) {
		const markdownOptions: DocumentExport.MarkdownOptions = {
			fileId: entryFile.file_id || "",
			fileName: entryFile.file_name || entryFile.name || "export.pdf",
			page,
			relativeFilePath: entryFile.relative_file_path,
			attachments: attachments as unknown[],
			onResourceLoadError,
		}
		const output = await documentExporter.generateMarkdownFile(markdownOptions).promise
		addOutput(output.data, output.fileName)
		return { warnings }
	}

	const prepared = await prepareTargetSlides(target, attachments)
	if (!hasHtmlSlides(prepared.result.htmlSlides)) {
		throw new Error("No HTML slides were prepared")
	}

	const preparedHtmlSlides = await prepareHtmlPagesForExport({
		pages: prepared.result.htmlSlides,
		attachments,
		fileId: prepared.fileId,
		fileName: prepared.fileName,
		attachmentList: attachments,
		displayConfig: prepared.displayConfig,
	})

	const exportOptions: DocumentExport.PageExportOptions = {
		fileName: `${prepared.result.fileName || "export"}.pdf`,
		skipFailedPages: true,
		pptMode: isPptMode,
		page,
		vector: { fitContentWidth: !isPptMode },
		onResourceLoadError,
	}
	const output = await documentExporter.generatePages(preparedHtmlSlides, exportOptions).promise
	addOutput(output.data, output.fileName)
	return { warnings }
}

async function exportPptxTarget(options: {
	target: ClientBatchExportTarget
	attachments: ClientBatchAttachment[]
	addOutput: (data: Blob, fileName: string) => void
}): Promise<{ warnings: number }> {
	const { target, attachments, addOutput } = options
	const prepared = await prepareTargetSlides(target, attachments)
	if (!hasHtmlSlides(prepared.result.htmlSlides)) {
		throw new Error("No HTML slides were prepared")
	}

	const preparedHtmlSlides = await prepareHtmlPagesForExport({
		pages: prepared.result.htmlSlides,
		attachments,
		fileId: prepared.fileId,
		fileName: prepared.fileName,
		attachmentList: attachments,
		displayConfig: prepared.displayConfig,
	})

	let warnings = 0
	const fontResolver = documentExportService.get()?.getPptFontResolver?.()
	const output = await generatePPTX(preparedHtmlSlides, {
		fileName: prepared.result.fileName,
		skipFailedPages: true,
		autoSize: !isClientBatchSlideDisplayConfig(prepared.displayConfig),
		fontResolver,
		onResourceLoadError: () => {
			warnings += 1
		},
		logLevel: "warn",
	}).promise
	addOutput(output.data, output.fileName)
	return { warnings }
}

function buildArtifact(
	format: ClientBatchExportFormat,
	projectName: string | undefined,
	outputs: Array<{ data: Uint8Array | Blob; fileName: string }>,
	onProgress?: (progress: number) => void,
): Promise<ClientBatchExportArtifact | undefined> {
	if (outputs.length === 0) return Promise.resolve(undefined)
	const defaultName = format === "pdf" ? "batch-export.pdf" : "batch-export.pptx"
	if (outputs.length === 1) {
		const output = outputs[0]
		const artifactMime =
			format === "pdf"
				? "application/pdf"
				: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
		const blob =
			output.data instanceof Blob
				? output.data
				: new Blob([output.data], { type: artifactMime })
		return Promise.resolve({ blob, fileName: output.fileName || defaultName })
	}

	return loadJSZip().then(async (JSZip) => {
		const zip = new JSZip()
		const usedNames = new Set<string>()
		for (const output of outputs) {
			zip.file(uniqueFileName(output.fileName || defaultName, usedNames), output.data)
		}
		const blob = await zip.generateAsync({ type: "blob" }, ({ percent }) => {
			onProgress?.(90 + Math.round(percent / 10))
		})
		const safeProject = sanitizeFileName(projectName || "batch-export", "batch-export")
		return {
			blob,
			fileName: `${safeProject}-${format}.zip`,
		}
	})
}

/**
 * Runs one client-side export per logical target and returns one browser artifact.
 * This module deliberately owns no toast, selection state, or backend conversion task;
 * the legacy menu remains a thin adapter while the exporter stays reusable elsewhere.
 */
export async function runClientBatchDocumentExport(
	options: ClientBatchExportRunOptions,
): Promise<ClientBatchExportRunResult> {
	const { format, targets, attachments, projectName, onProgress } = options
	if (targets.length === 0) {
		return { successCount: 0, failureCount: 0, failures: [], warnings: 0 }
	}

	const documentExporter = documentExportService.get()
	const resolveAttachmentScope = createAttachmentScopeResolver(attachments)

	let page: DocumentExport.PdfPageConfig | undefined
	if (format === "pdf") {
		if (!hasPdfDocumentGenerator(documentExporter)) {
			return {
				successCount: 0,
				failureCount: targets.length,
				failures: [],
				warnings: 0,
				unavailable: true,
			}
		}
		if (
			targets.some(
				(target) => !isClientBatchSlideDisplayConfig(getTargetDisplayConfig(target)),
			)
		) {
			const requestedPage = await documentExporter.requestPdfExportSettings()
			if (requestedPage === null) {
				return {
					successCount: 0,
					failureCount: 0,
					failures: [],
					warnings: 0,
					cancelled: true,
				}
			}
			page = requestedPage
		}
	}

	const outputs: Array<{ data: Uint8Array | Blob; fileName: string }> = []
	const failures: ClientBatchExportFailure[] = []
	let warnings = 0
	let successCount = 0
	for (let index = 0; index < targets.length; index += 1) {
		const target = targets[index]
		const attachmentScope = resolveAttachmentScope(target)
		const outputCountBefore = outputs.length
		try {
			if (format === "pdf") {
				if (!hasPdfDocumentGenerator(documentExporter)) {
					throw new Error("PDF exporter is unavailable")
				}
				const result = await exportPdfTarget({
					target,
					attachments: attachmentScope,
					page,
					documentExporter,
					addOutput: (data, fileName) => outputs.push({ data, fileName }),
				})
				warnings += result.warnings
			} else {
				const result = await exportPptxTarget({
					target,
					attachments: attachmentScope,
					addOutput: (data, fileName) => outputs.push({ data, fileName }),
				})
				warnings += result.warnings
			}
			if (outputs.length === outputCountBefore) {
				throw new Error("The exporter completed without producing an artifact")
			}
			successCount += 1
		} catch (error) {
			outputs.splice(outputCountBefore)
			failures.push({ target, error })
		}
		onProgress?.(Math.round(((index + 1) / targets.length) * 90))
	}

	const artifact = await buildArtifact(format, projectName, outputs, onProgress)
	onProgress?.(artifact ? 100 : 90)
	return {
		artifact,
		successCount,
		failureCount: failures.length,
		failures,
		warnings,
	}
}
