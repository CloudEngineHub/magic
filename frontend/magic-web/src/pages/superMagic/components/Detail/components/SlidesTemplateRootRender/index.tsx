import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircle } from "lucide-react"
import { SuperMagicApi } from "@/apis"
import MagicSpin from "@/components/base/MagicSpin"
import { Button } from "@/components/shadcn-ui/button"
import { createSlidesTemplateStructureAdapter } from "./templateStructureAdapter"
import { loadSlidesTemplateProject, stringifySlidesTemplateManifest } from "./templateProject"
import SlidesTemplatePreviewHeader from "./SlidesTemplatePreviewHeader"
import SlidesTemplateSettingsDialog from "./SlidesTemplateSettingsDialog"
import { useSlidesTemplateSaveFlow } from "./SlidesTemplateSaveFlow"
import type { SlidesTemplateManifest, SlidesTemplateProjectContext } from "./types"
import PPTRootRender from "../PPTRootRender"
import type { PPTRootRenderProps } from "../PPTRootRender/types"
import type { AttachmentItem } from "../../../TopicFilesButton/hooks/types"

function findAttachmentById(
	items: AttachmentItem[] | undefined,
	fileId: string,
): AttachmentItem | undefined {
	for (const item of items || []) {
		if (String(item.file_id || "") === fileId) return item
		const child = findAttachmentById(item.children, fileId)
		if (child) return child
	}
	return undefined
}

function getTemplateTitle(
	manifest: SlidesTemplateManifest,
	language: string,
	fallback: string,
): string {
	const localized = manifest.label || {}
	const isEnglish = language.toLowerCase().startsWith("en")
	return (
		(isEnglish ? localized.en_US : localized.zh_CN) ||
		(isEnglish ? localized.zh_CN : localized.en_US) ||
		manifest.template_id ||
		fallback
	)
}

interface SlidesTemplateReadyProps {
	initialProject: SlidesTemplateProjectContext
	props: PPTRootRenderProps
}

function SlidesTemplateReady({ initialProject, props }: SlidesTemplateReadyProps) {
	const { i18n } = useTranslation("super")
	const [manifest, setManifest] = useState(initialProject.manifest)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const manifestRef = useRef(initialProject.manifest)
	const projectId = props.selectedProject?.id || props.projectId

	const saveManifest = useCallback(
		async (nextManifest: SlidesTemplateManifest) => {
			await SuperMagicApi.saveFileContent([
				{
					file_id: initialProject.manifestFileId,
					content: stringifySlidesTemplateManifest(nextManifest),
					enable_shadow: true,
				},
			])
			manifestRef.current = nextManifest
			setManifest(nextManifest)
		},
		[initialProject.manifestFileId],
	)

	const getManifest = useCallback(() => manifestRef.current, [])
	const slideStructureAdapter = useMemo(
		() =>
			createSlidesTemplateStructureAdapter({
				project: initialProject,
				projectId,
				getManifest,
				saveManifest,
			}),
		[initialProject, projectId, getManifest, saveManifest],
	)
	const { isSaving, startSave, dialogs } = useSlidesTemplateSaveFlow({
		manifest,
		project: initialProject,
		projectId,
		onManifestSave: saveManifest,
	})
	const fallbackName =
		initialProject.root.file_name ||
		initialProject.root.filename ||
		initialProject.root.name ||
		initialProject.root.display_filename ||
		initialProject.rootPath.split("/").filter(Boolean).pop() ||
		initialProject.rootFileId
	const title = getTemplateTitle(manifest, i18n?.language || "zh_CN", fallbackName)
	const displayConfig = useMemo(
		() => ({ type: "slide" as const, slides: manifest.slides.map((slide) => slide.file) }),
		[manifest.slides],
	)

	return (
		<div className="flex h-full min-h-0 w-full flex-col bg-background">
			{!props.isFullscreen ? (
				<SlidesTemplatePreviewHeader
					allowEdit={props.allowEdit !== false}
					isSaving={isSaving}
					onOpenSettings={() => setSettingsOpen(true)}
					onSaveToMyTemplates={() => void startSave()}
					title={title}
				/>
			) : null}
			<div className="min-h-0 flex-1">
				<PPTRootRender
					{...props}
					className="h-full"
					data={{
						...props.data,
						file_id: initialProject.rootFileId,
						display_config: displayConfig,
					}}
					displayConfig={displayConfig}
					slideStructureAdapter={slideStructureAdapter}
					disableMagicProjectLookup
				/>
			</div>
			{props.allowEdit !== false ? (
				<SlidesTemplateSettingsDialog
					manifest={manifest}
					open={settingsOpen}
					onOpenChange={setSettingsOpen}
					onSave={saveManifest}
				/>
			) : null}
			{dialogs}
		</div>
	)
}

export default function SlidesTemplateRootRender(props: PPTRootRenderProps) {
	const { t } = useTranslation("super")
	const [project, setProject] = useState<SlidesTemplateProjectContext>()
	const [error, setError] = useState<Error>()
	const [reloadKey, setReloadKey] = useState(0)
	const rootId = String(props.data?.file_id || "")
	const root = useMemo(() => {
		return (
			findAttachmentById(props.attachments as AttachmentItem[] | undefined, rootId) ||
			findAttachmentById(props.attachmentList as AttachmentItem[] | undefined, rootId) ||
			(props.data as AttachmentItem)
		)
	}, [props.attachmentList, props.attachments, props.data, rootId])

	useEffect(() => {
		let cancelled = false
		setError(undefined)
		setProject(undefined)
		loadSlidesTemplateProject(root)
			.then((result) => {
				if (!cancelled) setProject(result)
			})
			.catch((reason) => {
				if (!cancelled)
					setError(reason instanceof Error ? reason : new Error(String(reason)))
			})
		return () => {
			cancelled = true
		}
	}, [reloadKey, root])

	if (error) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-background p-6">
				<div className="flex max-w-md flex-col items-center gap-3 text-center">
					<AlertCircle className="size-8 text-destructive" aria-hidden="true" />
					<div className="text-base font-medium">
						{t("fileViewer.slidesTemplateLoadFailed")}
					</div>
					<div className="text-sm text-muted-foreground">
						{t("fileViewer.slidesTemplateLoadFailedDescription")}
					</div>
					<Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
						{t("fileViewer.retry")}
					</Button>
				</div>
			</div>
		)
	}

	if (!project) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-background">
				<MagicSpin spinning />
			</div>
		)
	}

	return (
		<SlidesTemplateReady key={project.manifestFileId} initialProject={project} props={props} />
	)
}
