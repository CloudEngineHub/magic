import { AssetsApi, type AssetTagGroupItem } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Textarea } from "@/components/shadcn-ui/textarea"
import MemberDepartmentSelector from "@/components/business/MemberDepartmentSelector"
import { cn } from "@/utils/cn"
import { NodeType, type TreeNode } from "@dtyq/user-selector"
import { Loader2, Plus, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type {
	CanvasAssetResourceInfo,
	CanvasEditAssetTarget,
	CanvasLocalAssetUploadMode,
	CanvasOpenSaveAssetDialogParams,
	CanvasSaveAssetToLibraryParams,
	CanvasSaveLocalAssetToLibraryParams,
} from "@/components/CanvasDesign/public/magic-types"
import { getAssetDisplayName } from "@/components/CanvasDesign/ui/toolbar/asset-library/assetLibraryMedia"
import type {
	ImageContentAssetBindingParams,
	ImageContentAssetBindingResult,
} from "@/components/CanvasDesign/runtime/resources/asset/imageContentAssetBinding"
import AssetTagMultiSelect from "./AssetTagMultiSelect"

export interface LocalAssetFileDialogSource {
	file: File
	mode: CanvasLocalAssetUploadMode
}

type SaveAssetDialogSource =
	CanvasOpenSaveAssetDialogParams | LocalAssetFileDialogSource | CanvasEditAssetTarget

interface SaveAssetToLibraryDialogProps {
	open: boolean
	source: SaveAssetDialogSource | null
	onClose: () => void
	getPreviewUrl: (path: string) => Promise<string | undefined>
	onSave: (params: CanvasSaveAssetToLibraryParams) => Promise<CanvasAssetResourceInfo>
	onSaveLocalFile?: (
		params: CanvasSaveLocalAssetToLibraryParams,
	) => Promise<CanvasAssetResourceInfo>
	onUpdateTags?: (assetId: string, tagIds: string[]) => Promise<void>
	onBindSavedAsset: (params: ImageContentAssetBindingParams) => ImageContentAssetBindingResult
}

function isLocalAssetFileSource(
	source: SaveAssetDialogSource | null,
): source is LocalAssetFileDialogSource {
	return !!source && "file" in source && source.file instanceof File
}

function isEditAssetSource(source: SaveAssetDialogSource | null): source is CanvasEditAssetTarget {
	return !!source && "assetId" in source
}

type VisibilityMode = "private" | "team"

/** 选择器节点的记录 ID 与接口需要的用户/部门业务 ID 不一定相同。 */
function getTargetBusinessId(target: TreeNode): string {
	if (target.dataType === NodeType.User) {
		return (target as TreeNode & { user_id?: string }).user_id || target.id
	}
	return (target as TreeNode & { department_id?: string }).department_id || target.id
}

function getTargetLabel(target: TreeNode): string {
	return target.name || target.id
}

function getVisibilityTargets(targets: TreeNode[]): TreeNode[] {
	return targets.filter(
		(target) => target.dataType === NodeType.User || target.dataType === NodeType.Department,
	)
}

export default function SaveAssetToLibraryDialog({
	open,
	source,
	onClose,
	getPreviewUrl,
	onSave,
	onSaveLocalFile,
	onUpdateTags,
	onBindSavedAsset,
}: SaveAssetToLibraryDialogProps) {
	const { t } = useTranslation("super")
	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [visibility, setVisibility] = useState<VisibilityMode>("private")
	const [selectedTargets, setSelectedTargets] = useState<TreeNode[]>([])
	const [pendingTargets, setPendingTargets] = useState<TreeNode[]>([])
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
	const [tagGroups, setTagGroups] = useState<AssetTagGroupItem[]>([])
	const [previewUrl, setPreviewUrl] = useState<string>()
	const [loading, setLoading] = useState(false)
	const [loadingTags, setLoadingTags] = useState(false)
	const [saving, setSaving] = useState(false)
	const [selectorOpen, setSelectorOpen] = useState(false)
	const [error, setError] = useState<string>()
	const getPreviewUrlRef = useRef(getPreviewUrl)
	const localFileSource = isLocalAssetFileSource(source) ? source : null
	const editSource = isEditAssetSource(source) ? source : null
	const workspaceSource = localFileSource || editSource ? null : source
	const sourcePath = workspaceSource?.path
	const sourceName = localFileSource
		? getAssetDisplayName(localFileSource.file.name)
		: workspaceSource?.name
	const sourceIdentity = editSource
		? `edit:${editSource.assetId}`
		: localFileSource
			? `${localFileSource.file.name}:${localFileSource.file.size}:${localFileSource.file.lastModified}`
			: sourcePath
	const previewIsVideo = editSource
		? editSource.mediaType === "video"
		: localFileSource
			? localFileSource.file.type.startsWith("video/") ||
				/\.(mp4|mov|webm)$/i.test(localFileSource.file.name)
			: /\.(mp4|mov|webm)(?:$|[?#])/i.test(sourcePath ?? "")
	const fieldsLocked = Boolean(editSource)

	useEffect(() => {
		getPreviewUrlRef.current = getPreviewUrl
	}, [getPreviewUrl])

	// 表单状态只在切换素材或重新打开弹窗时初始化，不跟随宿主方法引用变化。
	useEffect(() => {
		if (!open || !sourceIdentity) return

		setName(editSource?.name ?? sourceName ?? "")
		setDescription(editSource?.description ?? "")
		setVisibility(editSource?.visibility ?? "private")
		setSelectedTargets([])
		setPendingTargets([])
		setSelectedTagIds(editSource?.tagIds ?? [])
		setPreviewUrl(editSource?.fileUrl ?? undefined)
		setSelectorOpen(false)
		setError(undefined)
		setLoading(!localFileSource && !editSource)
	}, [editSource, open, sourceIdentity, sourceName, localFileSource])

	const localPreviewFile = localFileSource?.file

	// 本地上传还没有工作区路径，预览直接使用 File。
	useEffect(() => {
		if (!open || !localPreviewFile) return

		const objectUrl = URL.createObjectURL(localPreviewFile)
		setPreviewUrl(objectUrl)
		setLoading(false)
		return () => {
			URL.revokeObjectURL(objectUrl)
		}
	}, [localPreviewFile, open])

	// 预览只绑定资源路径；getPreviewUrl 通过 ref 获取最新实现，避免宿主重渲染导致重复请求。
	useEffect(() => {
		if (!open || !sourcePath || localFileSource) return

		let cancelled = false
		setLoading(true)
		void getPreviewUrlRef
			.current(sourcePath)
			.then((url) => {
				if (cancelled) return
				setPreviewUrl(url)
				setLoading(false)
			})
			.catch(() => {
				if (cancelled) return
				setPreviewUrl(undefined)
				setLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [localFileSource, open, sourcePath])

	// 标签是独立的表单数据，只在弹窗打开时加载，不影响图片预览请求的生命周期。
	useEffect(() => {
		if (!open) return

		let cancelled = false
		setTagGroups([])
		setLoadingTags(true)
		void AssetsApi.getAssetTags()
			.then((groups) => {
				if (!cancelled) setTagGroups(groups)
			})
			.catch(() => {
				if (!cancelled) setTagGroups([])
			})
			.finally(() => {
				if (!cancelled) setLoadingTags(false)
			})

		return () => {
			cancelled = true
		}
	}, [open])

	const tags = useMemo(
		() =>
			tagGroups.flatMap((group) =>
				group.tags.map((tag) => ({ ...tag, groupName: group.name })),
			),
		[tagGroups],
	)

	const handleSubmit = async () => {
		const trimmedName = name.trim()
		if (!trimmedName) {
			setError(t("assetLibrarySave.nameRequired"))
			return
		}
		if (
			!fieldsLocked &&
			visibility === "team" &&
			getVisibilityTargets(selectedTargets).length === 0
		) {
			setError(t("assetLibrarySave.visibilityTargetRequired"))
			return
		}
		if (!source || saving) return

		setError(undefined)
		setSaving(true)
		try {
			if (editSource) {
				if (!onUpdateTags) return
				await onUpdateTags(editSource.assetId, selectedTagIds)
				toast.success(t("assetLibrarySave.editSuccess"))
				onClose()
				return
			}

			if (localFileSource) {
				if (!onSaveLocalFile) return
				await onSaveLocalFile({
					file: localFileSource.file,
					mode: localFileSource.mode,
					name: trimmedName,
					description: description.trim() || null,
					userIds:
						visibility === "team"
							? selectedTargets
									.filter((target) => target.dataType === NodeType.User)
									.map(getTargetBusinessId)
							: undefined,
					departmentIds:
						visibility === "team"
							? selectedTargets
									.filter((target) => target.dataType === NodeType.Department)
									.map(getTargetBusinessId)
							: undefined,
					tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
				})
				toast.success(t("assetLibrarySave.success"))
				onClose()
				return
			}

			if (!workspaceSource) return
			const asset = await onSave({
				elementId: workspaceSource.elementId,
				contentId: workspaceSource.contentId,
				path: workspaceSource.path,
				name: trimmedName,
				description: description.trim() || null,
				userIds:
					visibility === "team"
						? selectedTargets
								.filter((target) => target.dataType === NodeType.User)
								.map(getTargetBusinessId)
						: undefined,
				departmentIds:
					visibility === "team"
						? selectedTargets
								.filter((target) => target.dataType === NodeType.Department)
								.map(getTargetBusinessId)
						: undefined,
				tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
			})
			let bindingResult: ImageContentAssetBindingResult
			try {
				bindingResult = onBindSavedAsset({
					elementId: workspaceSource.elementId,
					contentId: workspaceSource.contentId,
					sourcePath: workspaceSource.path,
					assetId: asset.assetId,
				})
			} catch {
				// 素材已经保存成功，绑定异常不能让用户重试并创建重复素材。
				bindingResult = "target-missing"
			}
			if (bindingResult === "bound" || bindingResult === "already-bound") {
				toast.success(t("assetLibrarySave.success"))
			} else {
				toast.warning(t("assetLibrarySave.bindingSkipped"))
			}
			onClose()
		} catch (saveError) {
			toast.error(
				saveError instanceof Error ? saveError.message : t("assetLibrarySave.saveFailed"),
			)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen && !saving) onClose()
			}}
		>
			<DialogContent
				className="w-[min(780px,calc(100vw-32px))] max-w-[780px] gap-0 overflow-hidden p-0 sm:max-w-[780px]"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => {
					// MemberDepartmentSelector uses its own portal; keep its pointer events from
					// being interpreted as an outside click by this parent dialog.
					if (selectorOpen) {
						event.preventDefault()
						event.stopPropagation()
					}
				}}
				onFocusOutside={(event) => {
					if (selectorOpen) {
						event.preventDefault()
						event.stopPropagation()
					}
				}}
				onEscapeKeyDown={(event) => {
					if (selectorOpen) {
						event.preventDefault()
						event.stopPropagation()
					}
				}}
				data-testid="save-asset-to-library-dialog"
			>
				<DialogHeader className="border-b px-5 py-4 pr-12 text-left">
					<DialogTitle>
						{editSource ? t("assetLibrarySave.editTitle") : t("assetLibrarySave.title")}
					</DialogTitle>
					<DialogDescription>
						{editSource
							? t("assetLibrarySave.editDescription")
							: t("assetLibrarySave.description")}
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="max-h-[calc(100vh-180px)] min-h-0">
					<div className="grid grid-cols-1 gap-6 px-5 py-5 sm:grid-cols-[180px_minmax(0,1fr)]">
						<div className="w-full max-w-[180px] space-y-2">
							<div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted">
								{loading ? (
									<Loader2
										className="size-5 animate-spin text-muted-foreground"
										aria-hidden="true"
									/>
								) : previewUrl && previewIsVideo ? (
									<video
										src={previewUrl}
										className="h-full w-full object-contain"
										muted
										playsInline
										controls
									/>
								) : previewUrl ? (
									<img
										src={previewUrl}
										alt={name || t("assetLibrarySave.preview")}
										className="h-full w-full object-contain"
									/>
								) : (
									<span className="px-4 text-center text-xs text-muted-foreground">
										{t("assetLibrarySave.previewUnavailable")}
									</span>
								)}
							</div>
						</div>

						<div className="min-w-0 space-y-5">
							<label className="block space-y-2">
								<span className="text-sm font-medium text-foreground">
									{t("assetLibrarySave.nameLabel")}
									<span className="ml-1 text-destructive">*</span>
								</span>
								<div className="relative">
									<Input
										value={name}
										maxLength={255}
										disabled={fieldsLocked}
										placeholder={t("assetLibrarySave.namePlaceholder")}
										onChange={(event) => {
											setName(event.target.value)
											setError(undefined)
										}}
										aria-invalid={Boolean(error && !name.trim())}
									/>
									<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
										{name.length}/255
									</span>
								</div>
							</label>

							<label className="block space-y-2">
								<span className="text-sm font-medium text-foreground">
									{t("assetLibrarySave.descriptionLabel")}
								</span>
								<Textarea
									value={description}
									rows={3}
									disabled={fieldsLocked}
									placeholder={t("assetLibrarySave.descriptionPlaceholder")}
									onChange={(event) => setDescription(event.target.value)}
								/>
							</label>

							<div className="space-y-2">
								<span className="text-sm font-medium text-foreground">
									{t("assetLibrarySave.visibilityLabel")}
									<span className="ml-1 text-destructive">*</span>
								</span>
								<div className="grid grid-cols-2 rounded-lg border bg-muted/40 p-1">
									{(["private", "team"] as const).map((mode) => (
										<button
											key={mode}
											type="button"
											disabled={fieldsLocked}
											className={cn(
												"rounded-md px-3 py-2 text-sm font-medium transition-colors",
												visibility === mode
													? "bg-background text-primary shadow-sm"
													: "text-muted-foreground hover:text-foreground",
											)}
											onClick={() => {
												setVisibility(mode)
												setError(undefined)
											}}
										>
											{mode === "private"
												? t("assetLibrarySave.privateVisibility")
												: t("assetLibrarySave.teamVisibility")}
										</button>
									))}
								</div>
								{fieldsLocked ? null : visibility === "private" ? (
									<p className="text-xs text-muted-foreground">
										{t("assetLibrarySave.privateHint")}
									</p>
								) : (
									<div className="space-y-2">
										<div className="flex flex-wrap gap-1.5">
											{selectedTargets.map((target) => (
												<span
													key={`${target.dataType}-${getTargetBusinessId(target)}`}
													className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
												>
													<span className="truncate">
														{getTargetLabel(target)}
													</span>
													<button
														type="button"
														className="text-muted-foreground hover:text-foreground"
														aria-label={t(
															"assetLibrarySave.removeTarget",
														)}
														onClick={() =>
															setSelectedTargets((current) =>
																current.filter(
																	(item) =>
																		item.dataType !==
																			target.dataType ||
																		getTargetBusinessId(
																			item,
																		) !==
																			getTargetBusinessId(
																				target,
																			),
																),
															)
														}
													>
														<X className="size-3" aria-hidden="true" />
													</button>
												</span>
											))}
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="gap-1.5"
											onClick={() => setSelectorOpen(true)}
										>
											<Plus className="size-4" aria-hidden="true" />
											{t("assetLibrarySave.selectTargets")}
										</Button>
									</div>
								)}
							</div>

							<div className="space-y-2">
								<span className="text-sm font-medium text-foreground">
									{t("assetLibrarySave.tagsLabel")}
								</span>
								{loadingTags ? (
									<div className="flex items-center text-xs text-muted-foreground">
										<Loader2
											className="mr-1.5 size-3.5 animate-spin"
											aria-hidden="true"
										/>
										{t("assetLibrarySave.loadingTags")}
									</div>
								) : tags.length > 0 ? (
									<AssetTagMultiSelect
										options={tags}
										value={selectedTagIds}
										onChange={setSelectedTagIds}
										label={t("assetLibrarySave.tagsLabel")}
										placeholder={t("assetLibrarySave.tagsPlaceholder")}
										searchPlaceholder={t(
											"assetLibrarySave.tagsSearchPlaceholder",
										)}
										emptyText={t("assetLibrarySave.noMatchingTags")}
										removeLabel={t("assetLibrarySave.removeTag")}
									/>
								) : (
									<p className="text-xs text-muted-foreground">
										{t("assetLibrarySave.noTags")}
									</p>
								)}
							</div>

							{error ? <p className="text-sm text-destructive">{error}</p> : null}
						</div>
					</div>
				</ScrollArea>

				<DialogFooter className="border-t px-5 py-3 sm:items-center">
					<Button type="button" variant="outline" onClick={onClose} disabled={saving}>
						{t("assetLibrarySave.cancel")}
					</Button>
					<Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
						{saving ? (
							<Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
						) : null}
						{editSource
							? t("assetLibrarySave.save")
							: localFileSource?.mode === "verify"
								? t("assetLibrarySave.saveAndVerify")
								: t("assetLibrarySave.save")}
					</Button>
				</DialogFooter>
			</DialogContent>

			<MemberDepartmentSelector
				open={selectorOpen}
				title={t("assetLibrarySave.selectTargets")}
				selectedValues={pendingTargets}
				onSelectChange={(values) =>
					setPendingTargets(getVisibilityTargets(values as TreeNode[]))
				}
				onOk={(values) => {
					const confirmedTargets = getVisibilityTargets(values as TreeNode[])
					setSelectedTargets(confirmedTargets)
					setPendingTargets(confirmedTargets)
					setSelectorOpen(false)
				}}
				onCancel={() => {
					setPendingTargets(selectedTargets)
					setSelectorOpen(false)
				}}
				zIndex={1600}
			/>
		</Dialog>
	)
}
