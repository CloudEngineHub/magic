import { useState, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import projectFilesStore from "@/stores/projectFiles"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import type { ReferenceFileValue } from "./types"

export type { ReferenceFileValue }

interface ReferenceFilePickerProps {
	value: ReferenceFileValue[]
	onChange: (value: ReferenceFileValue[]) => void
	/** Max selectable files; omit for unlimited */
	maxFiles?: number
	disabled?: boolean
	onError?: (message: string) => void
}

const TEXT_EXTENSIONS = new Set([
	"txt",
	"md",
	"markdown",
	"css",
	"scss",
	"less",
	"html",
	"htm",
	"js",
	"jsx",
	"ts",
	"tsx",
	"json",
	"xml",
	"svg",
	"csv",
	"yaml",
	"yml",
	"vue",
])

function isTextFileName(name: string): boolean {
	const ext = name.split(".").pop()?.toLowerCase() || ""
	return TEXT_EXTENSIONS.has(ext)
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

function readLocalFile(file: File): Promise<ReferenceFileValue> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		const asText = file.type.startsWith("text/") || isTextFileName(file.name)
		reader.onload = () =>
			resolve({
				name: file.name,
				content: reader.result as string,
				kind: asText ? "text" : "data-url",
			})
		reader.onerror = () => reject(reader.error)
		if (asText) reader.readAsText(file)
		else reader.readAsDataURL(file)
	})
}

async function readProjectFile(
	fileId: string,
	fileName: string,
	filePath?: string,
): Promise<ReferenceFileValue> {
	if (isTextFileName(fileName)) {
		const content = (await getFileContentById(fileId, {
			responseType: "text",
		})) as string
		return { name: fileName, content, kind: "text", file_id: fileId, file_path: filePath }
	}

	const blob = (await getFileContentById(fileId, {
		responseType: "blob",
	})) as Blob
	const content = await blobToDataUrl(blob)
	return { name: fileName, content, kind: "data-url", file_id: fileId, file_path: filePath }
}

export default function ReferenceFilePicker({
	value,
	onChange,
	maxFiles,
	disabled = false,
	onError,
}: ReferenceFilePickerProps) {
	const { t } = useTranslation("super")
	const [showProjectPicker, setShowProjectPicker] = useState(false)
	const [loadingProjectFile, setLoadingProjectFile] = useState(false)
	const fileInputRef = useRef<HTMLInputElement | null>(null)

	const canAddMore = maxFiles == null || value.length < maxFiles
	const allowMultiSelect = maxFiles == null || maxFiles > 1

	const appendFiles = useCallback(
		(files: ReferenceFileValue[]) => {
			if (!files.length) return
			const limit = maxFiles ?? Infinity
			const remaining = limit - value.length
			if (remaining <= 0) return
			onChange([...value, ...files.slice(0, remaining)])
		},
		[maxFiles, onChange, value],
	)

	const handleLocalFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const fileList = e.target.files
			if (!fileList?.length) return

			const readers = Array.from(fileList).map((file) => readLocalFile(file))
			void Promise.all(readers)
				.then(appendFiles)
				.catch(() => {
					onError?.(t("detail.selfMedia.initPanel.referenceFilePicker.readLocalError"))
				})
			e.target.value = ""
		},
		[appendFiles, onError, t],
	)

	const handleProjectFileSelect = useCallback(
		async (fileId: string, fileName: string, filePath?: string) => {
			setLoadingProjectFile(true)
			try {
				appendFiles([await readProjectFile(fileId, fileName, filePath)])
				setShowProjectPicker(false)
			} catch {
				onError?.(t("detail.selfMedia.initPanel.referenceFilePicker.readProjectError"))
			} finally {
				setLoadingProjectFile(false)
			}
		},
		[appendFiles, onError, t],
	)

	const handleRemove = useCallback(
		(index: number) => {
			onChange(value.filter((_, i) => i !== index))
		},
		[onChange, value],
	)

	const isDisabled = disabled || loadingProjectFile

	const projectFiles = projectFilesStore.workspaceFilesList.filter((f) => !f.is_directory)

	return (
		<div className="relative">
			{value.length > 0 && (
				<div className="mb-2 flex flex-col gap-1.5">
					{value.map((file, index) => (
						<div
							key={`${file.name}-${index}`}
							className="flex items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 py-2"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="shrink-0 text-primary"
							>
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
							</svg>
							<span className="flex-1 truncate text-xs text-foreground">
								{file.name}
							</span>
							<button
								type="button"
								className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
								onClick={() => handleRemove(index)}
								disabled={disabled}
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M18 6 6 18M6 6l12 12" />
								</svg>
							</button>
						</div>
					))}
				</div>
			)}

			{canAddMore && (
				<>
					<input
						ref={fileInputRef}
						type="file"
						multiple={allowMultiSelect}
						className="hidden"
						onChange={handleLocalFileSelect}
					/>
					<div className="flex w-full gap-2">
						<button
							type="button"
							className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-input px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
							onClick={() => fileInputRef.current?.click()}
							disabled={isDisabled}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</svg>
							{t("detail.selfMedia.initPanel.referenceFilePicker.localUpload")}
						</button>
						<button
							type="button"
							className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-input px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
							onClick={() => setShowProjectPicker(true)}
							disabled={isDisabled}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
							</svg>
							{t("detail.selfMedia.initPanel.referenceFilePicker.projectFile")}
						</button>
					</div>
					<p className="mt-1 text-[11px] text-muted-foreground/60">
						{t("detail.selfMedia.initPanel.referenceFilePicker.hint")}
					</p>
				</>
			)}

			{showProjectPicker && canAddMore && (
				<div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">
					<div className="flex items-center justify-between border-b border-border/50 px-2 py-1.5">
						<span className="text-[11px] font-medium text-muted-foreground">
							{t("detail.selfMedia.initPanel.referenceFilePicker.pickProjectTitle")}
						</span>
						<button
							type="button"
							className="rounded p-0.5 text-muted-foreground hover:text-foreground"
							onClick={() => setShowProjectPicker(false)}
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
						</button>
					</div>
					{projectFiles.map((f) => (
						<button
							key={f.file_id}
							type="button"
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
							onClick={() =>
								handleProjectFileSelect(
									f.file_id!,
									f.display_filename || f.file_name || "未命名文件",
									f.relative_file_path ?? undefined,
								)
							}
							disabled={loadingProjectFile}
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="shrink-0 text-muted-foreground"
							>
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
							</svg>
							<span className="truncate">{f.display_filename || f.file_name}</span>
							{f.relative_file_path && (
								<span className="ml-auto truncate text-[10px] text-muted-foreground/60">
									{f.relative_file_path}
								</span>
							)}
						</button>
					))}
					{projectFiles.length === 0 && (
						<p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
							{t("detail.selfMedia.initPanel.referenceFilePicker.noProjectFiles")}
						</p>
					)}
					{loadingProjectFile && (
						<div className="flex items-center justify-center py-2">
							<svg
								className="animate-spin"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path d="M21 12a9 9 0 1 1-6.219-8.56" />
							</svg>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
