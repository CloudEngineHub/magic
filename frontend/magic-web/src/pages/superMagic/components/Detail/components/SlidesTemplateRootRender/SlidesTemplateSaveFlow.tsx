import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import { Label } from "@/components/shadcn-ui/label"
import { createRandomUuidV4 } from "@/utils/create-random-uuid-v4"
import {
	mySlidesTemplateAdapter,
	MySlidesTemplateAdapterUnavailableError,
} from "@/pages/superMagic/services/mySlidesTemplateAdapter"
import type { SlidesTemplateManifest, SlidesTemplateProjectContext } from "./types"

interface SlidesTemplateSaveFlowProps {
	manifest: SlidesTemplateManifest
	project: SlidesTemplateProjectContext
	projectId?: string
	onManifestSave: (manifest: SlidesTemplateManifest) => Promise<void>
	onSaved?: () => void
}

export function useSlidesTemplateSaveFlow({
	manifest,
	project,
	projectId,
	onManifestSave,
	onSaved,
}: SlidesTemplateSaveFlowProps) {
	const { t } = useTranslation("super")
	const [isSaving, setIsSaving] = useState(false)
	const [conflictOpen, setConflictOpen] = useState(false)
	const [saveAsOpen, setSaveAsOpen] = useState(false)
	const [saveAsNames, setSaveAsNames] = useState({ en_US: "", zh_CN: "" })
	const [saveAsError, setSaveAsError] = useState("")
	const [existingTargetId, setExistingTargetId] = useState<string>()

	const folderName = useMemo(
		() =>
			project.root.file_name ||
			project.root.filename ||
			project.root.name ||
			project.root.display_filename ||
			project.rootPath.split("/").filter(Boolean).pop() ||
			project.rootFileId,
		[project.root, project.rootFileId, project.rootPath],
	)
	const templateId = manifest.template_id || folderName
	const baseZh = manifest.label?.zh_CN || manifest.label?.en_US || folderName
	const baseEn = manifest.label?.en_US || manifest.label?.zh_CN || folderName

	async function saveNewManifest(nextManifest: SlidesTemplateManifest) {
		const previousManifest = manifest
		await onManifestSave(nextManifest)
		try {
			await mySlidesTemplateAdapter.saveFromFolder({
				projectId: projectId || "",
				folderId: project.rootFileId,
				folderName,
				mode: "create",
			})
		} catch (error) {
			try {
				await onManifestSave(previousManifest)
			} catch (rollbackError) {
				console.error(
					"Failed to roll back template manifest after save failure",
					rollbackError,
				)
				throw new Error(t("slidesTemplatePreview.save.rollbackFailed"))
			}
			throw error
		}
	}

	async function startSave() {
		if (isSaving) return
		if (!mySlidesTemplateAdapter.enabled || !mySlidesTemplateAdapter.checkByTemplateId) {
			magicToast.info(t("slidesTemplatePreview.save.unavailable"))
			return
		}
		if (!projectId) {
			magicToast.error(t("slidesTemplatePreview.save.failed"))
			return
		}
		setIsSaving(true)
		try {
			const result = await mySlidesTemplateAdapter.checkByTemplateId({ templateId })
			if (result.exists) {
				setExistingTargetId(result.template?.id)
				setConflictOpen(true)
				return
			}
			await mySlidesTemplateAdapter.saveFromFolder({
				projectId,
				folderId: project.rootFileId,
				folderName,
				mode: "create",
			})
			magicToast.success(t("slidesTemplatePreview.save.success"))
			onSaved?.()
		} catch (error) {
			if (!(error instanceof MySlidesTemplateAdapterUnavailableError)) {
				magicToast.error(t("slidesTemplatePreview.save.failed"))
			}
		} finally {
			setIsSaving(false)
		}
	}

	async function overwrite() {
		if (!existingTargetId || !projectId) return
		setIsSaving(true)
		try {
			await mySlidesTemplateAdapter.saveFromFolder({
				projectId,
				folderId: project.rootFileId,
				folderName,
				mode: "overwrite",
				targetId: existingTargetId,
			})
			setConflictOpen(false)
			magicToast.success(t("slidesTemplatePreview.save.success"))
			onSaved?.()
		} catch {
			magicToast.error(t("slidesTemplatePreview.save.failed"))
		} finally {
			setIsSaving(false)
		}
	}

	function openSaveAs() {
		setConflictOpen(false)
		setSaveAsError("")
		setSaveAsNames({ en_US: `${baseEn} Copy`, zh_CN: `${baseZh}副本` })
		setSaveAsOpen(true)
	}

	async function saveAs() {
		if (!projectId) return
		const zh = saveAsNames.zh_CN.trim()
		const en = saveAsNames.en_US.trim()
		if (!zh || !en) {
			setSaveAsError(t("slidesTemplatePreview.save.copyRequired"))
			return
		}
		if (!mySlidesTemplateAdapter.checkByTemplateId) return
		setIsSaving(true)
		setSaveAsError("")
		try {
			let nextId = ""
			for (let attempt = 0; attempt < 3; attempt += 1) {
				const candidate = `${templateId}-copy-${createRandomUuidV4().replace(/-/g, "").slice(0, 8)}`
				const check = await mySlidesTemplateAdapter.checkByTemplateId({
					templateId: candidate,
				})
				if (!check.exists) {
					nextId = candidate
					break
				}
			}
			if (!nextId) {
				setSaveAsError(t("slidesTemplatePreview.save.copyConflict"))
				return
			}
			const nextManifest: SlidesTemplateManifest = {
				...manifest,
				template_id: nextId,
				label: { ...manifest.label, zh_CN: zh, en_US: en },
			}
			await saveNewManifest(nextManifest)
			setSaveAsOpen(false)
			magicToast.success(t("slidesTemplatePreview.save.success"))
			onSaved?.()
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === t("slidesTemplatePreview.save.rollbackFailed")
			) {
				magicToast.error(error.message)
			} else {
				setSaveAsError(t("slidesTemplatePreview.save.failed"))
			}
		} finally {
			setIsSaving(false)
		}
	}

	const dialogs = (
		<>
			<AlertDialog
				open={conflictOpen}
				onOpenChange={(open) => !isSaving && setConflictOpen(open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("slidesTemplatePreview.save.existingTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("slidesTemplatePreview.save.existingDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isSaving}>
							{t("slidesTemplatePreview.save.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction onClick={openSaveAs} disabled={isSaving}>
							{t("slidesTemplatePreview.save.saveAs")}
						</AlertDialogAction>
						<AlertDialogAction
							onClick={(event) => {
								event.preventDefault()
								void overwrite()
							}}
							disabled={isSaving}
						>
							{isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
							{t("slidesTemplatePreview.save.overwrite")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<Dialog open={saveAsOpen} onOpenChange={(open) => !isSaving && setSaveAsOpen(open)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("slidesTemplatePreview.save.saveAsTitle")}</DialogTitle>
						<DialogDescription>
							{t("slidesTemplatePreview.save.saveAsDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="slides-template-save-as-zh">
								{t("slidesTemplatePreview.save.copyLabelZh")}
							</Label>
							<Input
								id="slides-template-save-as-zh"
								value={saveAsNames.zh_CN}
								placeholder={t("slidesTemplatePreview.save.copyPlaceholderZh")}
								onChange={(event) =>
									setSaveAsNames((current) => ({
										...current,
										zh_CN: event.target.value,
									}))
								}
								aria-invalid={Boolean(saveAsError)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="slides-template-save-as-en">
								{t("slidesTemplatePreview.save.copyLabelEn")}
							</Label>
							<Input
								id="slides-template-save-as-en"
								value={saveAsNames.en_US}
								placeholder={t("slidesTemplatePreview.save.copyPlaceholderEn")}
								onChange={(event) =>
									setSaveAsNames((current) => ({
										...current,
										en_US: event.target.value,
									}))
								}
								aria-invalid={Boolean(saveAsError)}
							/>
						</div>
						{saveAsError ? (
							<p className="text-sm text-destructive" role="alert">
								{saveAsError}
							</p>
						) : null}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setSaveAsOpen(false)}
							disabled={isSaving}
						>
							{t("slidesTemplatePreview.save.cancel")}
						</Button>
						<Button type="button" onClick={() => void saveAs()} disabled={isSaving}>
							{isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
							{t("slidesTemplatePreview.save.saveAs")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)

	return { isSaving, startSave, dialogs }
}
