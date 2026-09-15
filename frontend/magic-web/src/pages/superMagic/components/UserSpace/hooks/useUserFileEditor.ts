import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import userFilesStore from "@/stores/userFiles"
import { getFileReferenceIdentityKey } from "@/pages/superMagic/services/userFileReferenceResolver"
import { mergeMemoryContent } from "../../LongTremMemory/services/memoryThreeWayMerge"
import {
	userSpaceFileService,
	UserFileConcurrentModificationError,
	type UserFileSnapshot,
} from "../services/userSpaceFileService"

export function useUserFileEditor(fileId: string, isEditMode: boolean, identityKey: string | null) {
	const { t } = useTranslation("super")
	const { t: memoryT } = useTranslation("super/longMemory")
	const [snapshot, setSnapshot] = useState<UserFileSnapshot | null>(null)
	const [draft, setDraft] = useState("")
	const [conflict, setConflict] = useState<UserFileSnapshot | null>(null)
	const [loading, setLoading] = useState(true)
	const [loadError, setLoadError] = useState(false)
	const [saving, setSaving] = useState(false)
	const requestRef = useRef<AbortController | null>(null)
	const savingRef = useRef(false)
	const mounted = useRef(true)

	const isCurrent = useMemoizedFn(
		() => mounted.current && identityKey === getFileReferenceIdentityKey(),
	)
	const applySnapshot = useMemoizedFn((next: UserFileSnapshot) => {
		setSnapshot(next)
		setDraft(next.content)
		setConflict(null)
	})

	const load = useMemoizedFn(async () => {
		requestRef.current?.abort()
		const controller = new AbortController()
		requestRef.current = controller
		setLoading(true)
		setLoadError(false)
		try {
			const next = await userSpaceFileService.readStableSnapshot(fileId, controller.signal)
			if (isCurrent() && !controller.signal.aborted) applySnapshot(next)
		} catch {
			if (isCurrent() && !controller.signal.aborted) setLoadError(true)
		} finally {
			if (isCurrent() && !controller.signal.aborted) setLoading(false)
		}
	})

	useEffect(() => {
		mounted.current = true
		setSnapshot(null)
		setDraft("")
		void load()
		return () => {
			mounted.current = false
			requestRef.current?.abort()
		}
	}, [fileId, identityKey, isEditMode, load])

	useEffect(() => {
		userFilesStore.setFileEditing(fileId, isEditMode)
		return () => userFilesStore.setFileEditing(fileId, false)
	}, [fileId, isEditMode])

	/** 保存失败继续保留草稿；关闭 Tab 的保存回调必须收到异常，不能把冲突当作保存成功。 */
	const save = useMemoizedFn(async (revision = snapshot?.revision): Promise<void> => {
		if (!snapshot || revision === undefined || loading || savingRef.current || !isCurrent())
			throw new Error("User file is not ready")
		const savedDraft = draft
		const requestIdentity = identityKey
		savingRef.current = true
		setSaving(true)
		try {
			const result = await userSpaceFileService.saveFileContent(fileId, savedDraft, revision)
			if (!isCurrent() || requestIdentity !== getFileReferenceIdentityKey())
				throw new DOMException("Identity changed", "AbortError")
			setSnapshot({
				file: { ...snapshot.file, version: result.revision },
				revision: result.revision,
				content: savedDraft,
			})
			setConflict(null)
			if (userFilesStore.files.has(snapshot.file.parent_id))
				void userFilesStore
					.loadDirectory(snapshot.file.parent_id, true)
					.catch(() => undefined)
			magicToast.success(t("common.saveSuccess"))
		} catch (error) {
			if (isCurrent() && requestIdentity === getFileReferenceIdentityKey()) {
				if (error instanceof UserFileConcurrentModificationError) {
					try {
						const latest = await userSpaceFileService.readStableSnapshot(
							fileId,
							requestRef.current?.signal,
						)
						if (isCurrent() && requestIdentity === getFileReferenceIdentityKey())
							setConflict(latest)
					} catch {
						if (isCurrent()) magicToast.error(t("common.fileNotFoundOrLoadFailed"))
					}
				} else magicToast.error(t("common.saveFailed"))
			}
			throw error
		} finally {
			savingRef.current = false
			if (isCurrent()) setSaving(false)
		}
	})

	const merge = useMemoizedFn(() => {
		if (!snapshot || !conflict) return
		const merged = mergeMemoryContent(snapshot.content, draft, conflict.content, {
			local: memoryT("globalEditor.conflict.localLabel"),
			remote: memoryT("globalEditor.conflict.remoteLabel"),
		})
		setSnapshot(conflict)
		setDraft(merged.content)
		setConflict(null)
		magicToast.info(
			memoryT(
				merged.hasConflicts
					? "globalEditor.conflict.mergeHasConflicts"
					: "globalEditor.conflict.mergeReady",
			),
		)
	})

	return {
		snapshot,
		draft,
		setDraft: (value: string) => {
			if (!savingRef.current) setDraft(value)
		},
		conflict,
		setConflict,
		loading,
		loadError,
		saving,
		load,
		save,
		merge,
		useLatest: () => {
			if (conflict) applySnapshot(conflict)
		},
	}
}
