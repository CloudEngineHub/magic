import { useEffect, useMemo, useRef, useState } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useMagic } from "../../../app/providers/MagicProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import type { ImageElement, ImageElementContent } from "../../../runtime/document/types"
import type { CanvasImageFileRename, CanvasImageRenameFile } from "../../../public/magic-types"
import { GenerationStatus } from "../../../public/magic-types"

export interface ImageRenameRow {
	content: ImageElementContent
	version: number
	file?: CanvasImageRenameFile
	name: string
	status?: "saving" | "success" | "error"
	error?: string
	shared: boolean
}

export function splitRenameFileName(name: string): { base: string; extension: string } {
	const extension = name.match(/\.[^/.]+$/)?.[0] || ""
	return { base: extension ? name.slice(0, -extension.length) : name, extension }
}

export function useImageRename(element: ImageElement) {
	const { canvas } = useCanvas()
	const { methods } = useMagic()
	const { t } = useCanvasDesignI18n()
	const rename = methods?.imageRename
	const [elementName, setElementName] = useState(element.name || "")
	const [customBaseName, setBaseName] = useState<string>()
	const baseName = customBaseName ?? elementName
	const [drafts, setDrafts] = useState<Record<string, string>>({})
	const [results, setResults] = useState<
		Record<string, { status: "saving" | "success" | "error"; error?: string }>
	>({})
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState("")
	const [titleSaved, setTitleSaved] = useState(false)
	const savingRef = useRef(false)
	const stop = useRef(false)
	const bindings = useRef(new Map<string, string>())
	useEffect(
		() => () => {
			stop.current = true
		},
		[],
	)

	const files = element.contents.map((content) => {
		const processing =
			content.status === GenerationStatus.Pending ||
			content.status === GenerationStatus.Processing
		return !processing && content.src ? rename?.resolveImageRenameFile(content.src) : undefined
	})
	const rows: ImageRenameRow[] = element.contents.map((content, index) => {
		const resolved = files[index]
		const boundId = bindings.current.get(content.contentId)
		if (resolved && !boundId) bindings.current.set(content.contentId, resolved.fileId)
		const changedFile = resolved && boundId && resolved.fileId !== boundId
		const file = changedFile ? undefined : resolved
		return {
			content,
			version: index + 1,
			file,
			name: file ? (drafts[file.fileId] ?? file.fileName) : "",
			...(file && results[file.fileId]),
			error: changedFile
				? t("rename.fileChanged", "文件已变化，请重新打开命名面板。")
				: file
					? results[file.fileId]?.error
					: undefined,
			shared: Boolean(
				file && files.filter((item) => item?.fileId === file.fileId).length > 1,
			),
		}
	})

	const changes = useMemo(() => {
		const byFile = new Map<string, CanvasImageFileRename>()
		for (const row of rows) {
			if (
				row.file &&
				(row.name.trim() !== row.file.fileName ||
					results[row.file.fileId]?.status === "error")
			)
				byFile.set(row.file.fileId, {
					elementId: element.id,
					contentId: row.content.contentId,
					fileId: row.file.fileId,
					expectedName: row.file.fileName,
					targetName: row.name.trim(),
				})
		}
		return [...byFile.values()]
	}, [rows, element.id, results])

	const setFileName = (fileId: string, name: string) => {
		setDrafts((current) => ({ ...current, [fileId]: name }))
		setResults((current) => {
			const next = { ...current }
			delete next[fileId]
			return next
		})
		setError("")
	}
	const applyUniformNames = () => {
		const base = baseName.trim()
		if (!base) return
		const next = { ...drafts }
		const seen = new Set<string>()
		for (const row of rows) {
			if (!row.file || seen.has(row.file.fileId)) continue
			seen.add(row.file.fileId)
			next[row.file.fileId] =
				`${base}_v${row.version}${splitRenameFileName(row.file.fileName).extension}`
		}
		setDrafts(next)
		setResults({})
		setError("")
	}
	const save = async () => {
		if (savingRef.current || !canvas || !elementName.trim()) return
		const current = canvas.elementManager.getElementData(element.id)
		if (!canvas.permissionManager.canRename(current)) return
		const errors = rename?.validateImageFileRenames(changes) ?? {}
		if (Object.keys(errors).length) {
			setResults(
				Object.fromEntries(
					Object.entries(errors).map(([id, message]) => [
						id,
						{ status: "error", error: message },
					]),
				),
			)
			setError(t("rename.correctErrors", "请先修改标出的文件名错误。"))
			return
		}
		savingRef.current = true
		stop.current = false
		setSaving(true)
		setError("")
		try {
			// 元素标题独立保存；批量文件逐项记录实际结果，不假装是服务端原子事务。
			if (changes.length) canvas.historyManager.recordHistoryImmediate()
			const name = elementName.trim()
			if (current?.name !== name)
				canvas.elementManager.update(
					element.id,
					{ name },
					changes.length ? { historyPolicy: "exclude" } : undefined,
				)
			if (current?.name !== name) setTitleSaved(true)
			for (const change of changes) {
				if (stop.current) break
				setResults((previous) => ({ ...previous, [change.fileId]: { status: "saving" } }))
				try {
					if (!rename) throw new Error(t("rename.fileUnavailable", "当前文件不可重命名"))
					const file = await rename.renameImageFile(change)
					setDrafts((previous) => ({ ...previous, [file.fileId]: file.fileName }))
					setResults((previous) => ({
						...previous,
						[file.fileId]: { status: "success" },
					}))
				} catch (failure) {
					setResults((previous) => ({
						...previous,
						[change.fileId]: {
							status: "error",
							error:
								failure instanceof Error
									? failure.message
									: t("rename.failed", "重命名失败"),
						},
					}))
				}
			}
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : t("rename.failed", "重命名失败"))
		} finally {
			savingRef.current = false
			setSaving(false)
		}
	}
	const successCount = Object.values(results).filter(
		(result) => result.status === "success",
	).length
	const failedCount = Object.values(results).filter((result) => result.status === "error").length
	return {
		elementName,
		setElementName: (name: string) => {
			setElementName(name)
			setTitleSaved(false)
		},
		titleSaved,
		baseName,
		setBaseName,
		rows,
		changes,
		setFileName,
		applyUniformNames,
		save,
		saving,
		error,
		successCount,
		failedCount,
		requestStop: () => {
			stop.current = true
		},
		dirty: changes.length > 0 || elementName.trim() !== (element.name || ""),
	}
}
