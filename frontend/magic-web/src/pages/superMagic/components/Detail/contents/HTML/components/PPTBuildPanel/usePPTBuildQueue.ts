import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import type {
	HTMLEditorV2Ref,
	PPTBuildEntry,
	PPTBuildUpdate,
} from "../../iframe-bridge/types/props"

export function usePPTBuildQueue(editorRef: RefObject<HTMLEditorV2Ref>, contentRevision: number) {
	const { t } = useTranslation("super")
	const [entries, setEntries] = useState<PPTBuildEntry[]>([])
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState(false)
	const [failed, setFailed] = useState(false)
	const alive = useRef(false)
	const requestId = useRef(0)
	const pending = useRef(false)
	const reload = useCallback(async () => {
		const request = ++requestId.current
		try {
			const editor = editorRef.current
			if (!editor) throw new Error("Editor unavailable")
			const next = await editor.getPPTBuilds()
			if (!alive.current || request !== requestId.current) return
			setEntries(next)
			setFailed(false)
		} catch {
			if (alive.current && request === requestId.current) setFailed(true)
		} finally {
			if (alive.current && request === requestId.current) setLoading(false)
		}
	}, [editorRef])
	useEffect(() => {
		alive.current = true
		let active = true
		const editor = editorRef.current
		void editor?.setPPTBuildMarkers(true).catch(() => {
			if (active) magicToast.error(t("ppt.build.markersFailed"))
		})
		return () => {
			alive.current = false
			active = false
			// Runtime also removes markers on edit exit and document disposal.
			void editor?.setPPTBuildMarkers(false).catch(() => {
				/* The iframe may already have been disposed. */
			})
		}
	}, [editorRef, t])
	useEffect(() => {
		void reload()
	}, [contentRevision, reload])
	const update = useCallback(
		async (updates: PPTBuildUpdate[]) => {
			if (pending.current || !updates.length || !editorRef.current) return
			pending.current = true
			setBusy(true)
			try {
				await editorRef.current.updatePPTBuilds(updates)
				await reload()
			} catch (error) {
				if (alive.current)
					magicToast.error(
						String(error).includes("PPT_BUILD_NESTED")
							? t("ppt.build.nested")
							: t("ppt.build.saveFailed"),
					)
			} finally {
				pending.current = false
				if (alive.current) setBusy(false)
			}
		},
		[editorRef, reload, t],
	)
	return { entries, loading, busy, failed, update, reload }
}
