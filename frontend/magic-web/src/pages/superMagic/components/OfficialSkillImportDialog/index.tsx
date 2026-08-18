import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type DragEvent,
} from "react"
import {
	AlertTriangle,
	BadgeCheck,
	Check,
	FileArchive,
	Info,
	Loader2,
	Trash2,
	Upload,
	X,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Textarea } from "@/components/shadcn-ui/textarea"
import { Label } from "@/components/shadcn-ui/label"
import { Badge } from "@/components/shadcn-ui/badge"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { Switch } from "@/components/shadcn-ui/switch"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Progress } from "@/components/shadcn-ui/progress"
import { Separator } from "@/components/shadcn-ui/separator"
import magicToast from "@/components/base/MagicToaster/utils"
import { useUpload } from "@/hooks/useUploadFiles"
import { SupportLocales } from "@/constants/locale"
import { skillsService } from "@/services/skills/SkillsService"
import type { SkillMarketCategoryView } from "@/services/skills/SkillsService"
import type {
	ImportOfficialSkillResponse,
	ParseOfficialSkillResponse,
	SkillI18nText,
} from "@/apis/modules/skills"
import {
	createInitialSkillIdentityData,
	normalizeSkillI18nText,
	type SkillIdentityData,
	type UploadedFile,
} from "../ImportSkillDialog/types"
import IdentityStep from "../ImportSkillDialog/components/IdentityStep"

type ImportMode = "manual" | "direct"
type ManualStep = "upload" | "details"

interface OfficialSkillImportDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess?: (results: ImportOfficialSkillResponse[]) => void | Promise<void>
}

interface OfficialSkillMetadata {
	version: string
	categoryIds: string[]
	publishStatus: "OFFLINE" | "PUBLISHED"
	isHidden: boolean
	isFeatured: boolean
	sortOrder: string
}

const MAX_FILE_SIZE = 100 * 1024 * 1024

const INITIAL_METADATA: OfficialSkillMetadata = {
	version: "1.0.0",
	categoryIds: [],
	publishStatus: "OFFLINE",
	isHidden: false,
	isFeatured: false,
	sortOrder: "0",
}

function createInitialState() {
	return {
		identity: createInitialSkillIdentityData(),
		metadata: { ...INITIAL_METADATA },
	}
}

function normalizeArchiveFile(file: File) {
	return /\.(zip|skill)$/i.test(file.name)
}

function formatFileSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeRequestText(value: SkillI18nText, fallback: string): SkillI18nText {
	const defaultValue = value[SupportLocales.fallback]?.trim() || fallback.trim()
	const englishValue = value[SupportLocales.enUS]?.trim() || defaultValue
	return {
		...value,
		[SupportLocales.fallback]: defaultValue,
		[SupportLocales.enUS]: englishValue,
	}
}

function UploadDropzone({
	uploadedFile,
	onFileSelect,
	onFileRemove,
}: {
	uploadedFile: UploadedFile | null
	onFileSelect: (file: File) => void
	onFileRemove: () => void
}) {
	const { t } = useTranslation("crew/market")
	const inputRef = useRef<HTMLInputElement>(null)

	const handleInputChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0]
			if (file) onFileSelect(file)
			event.target.value = ""
		},
		[onFileSelect],
	)

	const handleDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.preventDefault()
			const file = event.dataTransfer.files?.[0]
			if (file) onFileSelect(file)
		},
		[onFileSelect],
	)

	return (
		<div className="flex flex-col gap-3">
			<input
				ref={inputRef}
				type="file"
				className="hidden"
				accept=".zip,.skill"
				onChange={handleInputChange}
				data-testid="official-skill-file-input"
			/>
			<div
				className="group flex min-h-[208px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-input bg-muted/20 px-6 py-8 transition-colors hover:border-foreground/40 hover:bg-muted/40"
				onClick={() => inputRef.current?.click()}
				onDrop={handleDrop}
				onDragOver={(event) => event.preventDefault()}
				data-testid="official-skill-dropzone"
			>
				<div className="flex size-12 items-center justify-center rounded-xl border border-border bg-background shadow-xs transition-transform group-hover:-translate-y-0.5">
					<Upload className="size-5 text-foreground" />
				</div>
				<div className="text-center">
					<p className="text-sm font-medium text-foreground">
						{t("officialSkillImport.upload.dropTitle")}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("officialSkillImport.upload.dropHint")}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					onClick={(event) => {
						event.stopPropagation()
						inputRef.current?.click()
					}}
					data-testid="official-skill-browse-button"
				>
					<FileArchive className="size-4" />
					{t("officialSkillImport.upload.browse")}
				</Button>
			</div>

			{uploadedFile ? (
				<div
					className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
					data-testid="official-skill-file-card"
				>
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
						<FileArchive className="size-4 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<p className="truncate text-sm font-medium text-foreground">
								{uploadedFile.file.name}
							</p>
							<span className="shrink-0 text-xs text-muted-foreground">
								{formatFileSize(uploadedFile.file.size)}
							</span>
						</div>
						<Progress value={uploadedFile.progress} className="mt-2 h-1.5" />
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
						onClick={onFileRemove}
						aria-label={t("officialSkillImport.upload.remove")}
						data-testid="official-skill-file-remove"
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			) : null}
		</div>
	)
}

function CategoryPicker({
	categories,
	selectedIds,
	loading,
	onChange,
}: {
	categories: SkillMarketCategoryView[]
	selectedIds: string[]
	loading: boolean
	onChange: (ids: string[]) => void
}) {
	const { t } = useTranslation("crew/market")

	const toggleCategory = useCallback(
		(id: string) => {
			if (selectedIds.includes(id)) {
				onChange(selectedIds.filter((item) => item !== id))
			} else {
				onChange([...selectedIds, id])
			}
		},
		[onChange, selectedIds],
	)

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<Label className="text-sm font-medium">
					{t("officialSkillImport.fields.category")}
				</Label>
				<span className="text-xs text-muted-foreground">
					{t("officialSkillImport.fields.categoryHint")}
				</span>
			</div>
			<div className="rounded-lg border border-border bg-muted/15 p-3">
				{loading ? (
					<div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
						<Loader2 className="size-3.5 animate-spin" />
						{t("officialSkillImport.fields.loadingCategories")}
					</div>
				) : categories.length === 0 ? (
					<p className="py-3 text-xs text-muted-foreground">
						{t("officialSkillImport.fields.noCategories")}
					</p>
				) : (
					<div className="grid max-h-32 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto pr-1 sm:grid-cols-3">
						{categories.map((category) => {
							const checked = selectedIds.includes(category.id)
							return (
								<label
									key={category.id}
									className="flex min-w-0 cursor-pointer items-center gap-2 text-sm"
								>
									<Checkbox
										checked={checked}
										onCheckedChange={() => toggleCategory(category.id)}
										aria-label={category.name}
									/>
									<span className="truncate">{category.name}</span>
								</label>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}

function MarketMetadataFields({
	metadata,
	categories,
	categoriesLoading,
	onChange,
}: {
	metadata: OfficialSkillMetadata
	categories: SkillMarketCategoryView[]
	categoriesLoading: boolean
	onChange: (next: OfficialSkillMetadata) => void
}) {
	const { t } = useTranslation("crew/market")

	return (
		<div className="flex flex-col gap-4">
			<Separator />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-2">
					<Label htmlFor="official-skill-version" className="text-sm font-medium">
						{t("officialSkillImport.fields.version")}
					</Label>
					<Input
						id="official-skill-version"
						value={metadata.version}
						onChange={(event) => onChange({ ...metadata, version: event.target.value })}
						placeholder="1.0.0"
						maxLength={32}
						data-testid="official-skill-version-input"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label className="text-sm font-medium">
						{t("officialSkillImport.fields.status")}
					</Label>
					<Select
						value={metadata.publishStatus}
						onValueChange={(value: OfficialSkillMetadata["publishStatus"]) =>
							onChange({ ...metadata, publishStatus: value })
						}
					>
						<SelectTrigger
							className="w-full"
							data-testid="official-skill-status-select"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="OFFLINE">
								{t("officialSkillImport.fields.offline")}
							</SelectItem>
							<SelectItem value="PUBLISHED">
								{t("officialSkillImport.fields.published")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			<CategoryPicker
				categories={categories}
				selectedIds={metadata.categoryIds}
				loading={categoriesLoading}
				onChange={(categoryIds) => onChange({ ...metadata, categoryIds })}
			/>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
					<span className="min-w-0">
						<span className="block text-sm font-medium">
							{t("officialSkillImport.fields.hidden")}
						</span>
						<span className="block text-xs text-muted-foreground">
							{t("officialSkillImport.fields.hiddenHint")}
						</span>
					</span>
					<Switch
						checked={metadata.isHidden}
						onCheckedChange={(checked) => onChange({ ...metadata, isHidden: checked })}
						data-testid="official-skill-hidden-switch"
					/>
				</label>
				<label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
					<span className="min-w-0">
						<span className="block text-sm font-medium">
							{t("officialSkillImport.fields.featured")}
						</span>
						<span className="block text-xs text-muted-foreground">
							{t("officialSkillImport.fields.featuredHint")}
						</span>
					</span>
					<Switch
						checked={metadata.isFeatured}
						onCheckedChange={(checked) =>
							onChange({ ...metadata, isFeatured: checked })
						}
						data-testid="official-skill-featured-switch"
					/>
				</label>
				<div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5">
					<Label htmlFor="official-skill-sort-order" className="text-sm font-medium">
						{t("officialSkillImport.fields.sortOrder")}
					</Label>
					<Input
						id="official-skill-sort-order"
						value={metadata.sortOrder}
						onChange={(event) =>
							onChange({ ...metadata, sortOrder: event.target.value })
						}
						inputMode="numeric"
						data-testid="official-skill-sort-order-input"
					/>
				</div>
			</div>
		</div>
	)
}

function OfficialSkillImportDialog({
	open,
	onOpenChange,
	onSuccess,
}: OfficialSkillImportDialogProps) {
	const { t } = useTranslation("crew/market")
	const [mode, setMode] = useState<ImportMode>("manual")
	const [manualStep, setManualStep] = useState<ManualStep>("upload")
	const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
	const [parseResult, setParseResult] = useState<ParseOfficialSkillResponse | null>(null)
	const [directFileKeys, setDirectFileKeys] = useState("")
	const [categories, setCategories] = useState<SkillMarketCategoryView[]>([])
	const [categoriesLoading, setCategoriesLoading] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [directProgress, setDirectProgress] = useState({ done: 0, total: 0, failed: 0 })
	const [identity, setIdentity] = useState<SkillIdentityData>(createInitialSkillIdentityData())
	const [metadata, setMetadata] = useState<OfficialSkillMetadata>({ ...INITIAL_METADATA })

	const { upload, uploading } = useUpload({
		storageType: "private",
		onProgress: (_, percent) =>
			setUploadedFile((previous) => (previous ? { ...previous, progress: percent } : null)),
	})
	const { upload: uploadPublic } = useUpload({ storageType: "public" })

	const reset = useCallback(() => {
		const initial = createInitialState()
		setMode("manual")
		setManualStep("upload")
		setUploadedFile(null)
		setParseResult(null)
		setDirectFileKeys("")
		setIdentity(initial.identity)
		setMetadata(initial.metadata)
		setIsSubmitting(false)
		setDirectProgress({ done: 0, total: 0, failed: 0 })
	}, [])

	useEffect(() => {
		if (!open) return
		let cancelled = false
		setCategoriesLoading(true)
		void skillsService
			.getSkillMarketCategories({ include_empty: true })
			.then((items) => {
				if (!cancelled) setCategories(items)
			})
			.catch(() => {
				if (!cancelled) magicToast.error(t("officialSkillImport.errors.categoriesFailed"))
			})
			.finally(() => {
				if (!cancelled) setCategoriesLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [open, t])

	const handleClose = useCallback(
		(force = false) => {
			if (isSubmitting && !force) return
			onOpenChange(false)
			reset()
		},
		[isSubmitting, onOpenChange, reset],
	)

	const handleFileSelect = useCallback(
		async (file: File) => {
			if (!normalizeArchiveFile(file)) {
				magicToast.error(t("officialSkillImport.errors.invalidFile"))
				return
			}
			if (file.size > MAX_FILE_SIZE) {
				magicToast.error(t("officialSkillImport.errors.fileTooLarge"))
				return
			}

			setUploadedFile({ file, progress: 0, status: "uploading" })
			setParseResult(null)
			try {
				const { fullfilled, rejected } = await upload([
					{ name: file.name, file, status: "init" },
				])
				if (rejected.length > 0 || fullfilled.length === 0) throw new Error("upload-failed")
				const parsed = await skillsService.parseOfficialSkillFile(fullfilled[0].value.key)
				setParseResult(parsed)
				setIdentity({
					...createInitialSkillIdentityData(),
					name: normalizeSkillI18nText(parsed.name_i18n, parsed.package_name),
					description: normalizeSkillI18nText(
						parsed.description_i18n,
						parsed.package_description,
					),
					source: normalizeSkillI18nText(
						parsed.source_i18n,
						t("officialSkillImport.defaultSource"),
					),
					iconUrl: parsed.logo || undefined,
				})
				setUploadedFile((previous) =>
					previous ? { ...previous, progress: 100, status: "done" } : null,
				)
				setManualStep("details")
			} catch {
				setUploadedFile((previous) => (previous ? { ...previous, status: "error" } : null))
				magicToast.error(t("officialSkillImport.errors.parseFailed"))
			}
		},
		[t, upload],
	)

	const handleFileRemove = useCallback(() => {
		setUploadedFile(null)
		setParseResult(null)
		setManualStep("upload")
	}, [])

	const fileKeys = useMemo(
		() =>
			directFileKeys
				.split(/[\n,]/)
				.map((value) => value.trim())
				.filter(Boolean),
		[directFileKeys],
	)

	const buildFields = useCallback(async () => {
		const name = normalizeRequestText(identity.name, parseResult?.package_name ?? "")
		const description = normalizeRequestText(
			identity.description,
			parseResult?.package_description ?? "",
		)
		const version = metadata.version.trim()
		if (!version || !name[SupportLocales.enUS] || !description[SupportLocales.enUS]) {
			magicToast.error(t("officialSkillImport.errors.requiredFields"))
			return null
		}

		let logo = identity.iconUrl
		if (identity.iconFile) {
			const { fullfilled } = await uploadPublic([
				{ name: identity.iconFile.name, file: identity.iconFile, status: "init" },
			])
			if (fullfilled.length > 0) logo = fullfilled[0].value.key
		}

		return {
			version,
			name_i18n: name,
			description_i18n: description,
			source_i18n: normalizeRequestText(
				identity.source,
				t("officialSkillImport.defaultSource"),
			),
			logo,
			category_ids: metadata.categoryIds,
			publish_status: metadata.publishStatus,
			is_hidden: metadata.isHidden,
			is_featured: metadata.isFeatured,
			sort_order: Number.parseInt(metadata.sortOrder, 10) || 0,
		} as const
	}, [identity, metadata, parseResult, t, uploadPublic])

	const handleSubmit = useCallback(async () => {
		if (mode === "manual" && !parseResult) return
		if (mode === "direct" && fileKeys.length === 0) {
			magicToast.error(t("officialSkillImport.errors.fileKeysRequired"))
			return
		}

		setIsSubmitting(true)
		try {
			const fields = await buildFields()
			if (!fields) return

			if (mode === "manual" && parseResult) {
				const result = await skillsService.importOfficialSkill({
					import_token: parseResult.import_token,
					...fields,
				})
				await onSuccess?.([result])
				magicToast.success(
					result.action === "updated"
						? t("officialSkillImport.success.updated")
						: t("officialSkillImport.success.created"),
				)
				handleClose(true)
				return
			}

			setDirectProgress({ done: 0, total: fileKeys.length, failed: 0 })
			const results: ImportOfficialSkillResponse[] = []
			let failed = 0
			for (const fileKey of fileKeys) {
				try {
					const result = await skillsService.importOfficialSkill({
						file_key: fileKey,
						...fields,
					})
					results.push(result)
				} catch {
					failed += 1
				}
				setDirectProgress((previous) => ({
					done: previous.done + 1,
					total: previous.total,
					failed,
				}))
			}

			if (results.length > 0) await onSuccess?.(results)
			if (failed > 0) {
				magicToast.warning(
					t("officialSkillImport.success.partial", {
						success: results.length,
						failed,
					}),
				)
			} else {
				magicToast.success(
					t("officialSkillImport.success.batch", { count: results.length }),
				)
			}
			if (results.length > 0) handleClose(true)
		} catch {
			magicToast.error(t("officialSkillImport.errors.importFailed"))
		} finally {
			setIsSubmitting(false)
		}
	}, [buildFields, fileKeys, handleClose, mode, onSuccess, parseResult, t])

	const isManualReady = uploadedFile?.status === "done" && parseResult != null
	const isDirectReady = fileKeys.length > 0
	const canSubmit = mode === "manual" ? isManualReady && manualStep === "details" : isDirectReady

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
			<DialogContent
				className="w-[min(860px,calc(100vw-24px))] max-w-none gap-0 overflow-hidden p-0"
				showCloseButton={false}
				data-testid="official-skill-import-dialog"
				onInteractOutside={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => event.preventDefault()}
			>
				<DialogHeader className="border-b border-border px-5 py-4">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<DialogTitle className="text-base font-semibold">
									{t("officialSkillImport.title")}
								</DialogTitle>
								<Badge variant="secondary" className="gap-1 text-[11px]">
									<BadgeCheck className="size-3" />
									{t("officialSkillImport.adminOnly")}
								</Badge>
							</div>
							<DialogDescription className="mt-1 text-xs">
								{t("officialSkillImport.description")}
							</DialogDescription>
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 shrink-0"
							onClick={() => handleClose()}
							aria-label={t("officialSkillImport.close")}
						>
							<X className="size-4" />
						</Button>
					</div>
				</DialogHeader>

				<Tabs
					value={mode}
					onValueChange={(value) => setMode(value as ImportMode)}
					className="min-h-0 gap-0"
				>
					<div className="border-b border-border px-5 pt-3">
						<TabsList className="h-9 w-full justify-start gap-5 rounded-none bg-transparent p-0">
							<TabsTrigger
								value="manual"
								className="h-9 rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent"
								data-testid="official-skill-manual-tab"
							>
								{t("officialSkillImport.modes.manual")}
							</TabsTrigger>
							<TabsTrigger
								value="direct"
								className="h-9 rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent"
								data-testid="official-skill-direct-tab"
							>
								{t("officialSkillImport.modes.direct")}
							</TabsTrigger>
						</TabsList>
					</div>

					<ScrollArea className="h-[min(640px,calc(100vh-250px))]">
						<TabsContent value="manual" className="m-0 px-5 py-5">
							{manualStep === "upload" ? (
								<div className="flex flex-col gap-4">
									<div className="flex items-center gap-3 text-xs text-muted-foreground">
										<span className="flex items-center gap-1.5 font-medium text-foreground">
											<span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] text-background">
												1
											</span>
											{t("officialSkillImport.steps.selectFile")}
										</span>
										<span className="h-px w-8 bg-border" />
										<span className="flex items-center gap-1.5">
											<span className="flex size-5 items-center justify-center rounded-full border border-border text-[11px]">
												2
											</span>
											{t("officialSkillImport.steps.completeInfo")}
										</span>
									</div>
									<UploadDropzone
										uploadedFile={uploadedFile}
										onFileSelect={handleFileSelect}
										onFileRemove={handleFileRemove}
									/>
								</div>
							) : (
								<div className="flex flex-col gap-5">
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-2 text-xs text-muted-foreground">
											<span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] text-background">
												<Check className="size-3" />
											</span>
											{t("officialSkillImport.steps.selectFile")}
										</div>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 text-xs"
											onClick={() => setManualStep("upload")}
										>
											{t("officialSkillImport.buttons.changeFile")}
										</Button>
									</div>
									{parseResult ? (
										<div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
											<div className="flex min-w-0 items-center gap-2">
												<FileArchive className="size-4 shrink-0 text-muted-foreground" />
												<div className="min-w-0">
													<p className="truncate text-sm font-medium">
														{parseResult.package_name}
													</p>
													<p className="truncate text-xs text-muted-foreground">
														{parseResult.code}
													</p>
												</div>
											</div>
											<Badge
												variant={
													parseResult.is_update ? "outline" : "secondary"
												}
											>
												{parseResult.is_update
													? t("officialSkillImport.updateExisting")
													: t("officialSkillImport.createNew")}
											</Badge>
										</div>
									) : null}
									<IdentityStep
										identity={identity}
										onChange={setIdentity}
										namePlaceholder={t(
											"officialSkillImport.fields.namePlaceholder",
										)}
										descriptionPlaceholder={t(
											"officialSkillImport.fields.descriptionPlaceholder",
										)}
										sourcePlaceholder={t(
											"officialSkillImport.fields.sourcePlaceholder",
										)}
									/>
									<MarketMetadataFields
										metadata={metadata}
										categories={categories}
										categoriesLoading={categoriesLoading}
										onChange={setMetadata}
									/>
								</div>
							)}
						</TabsContent>

						<TabsContent value="direct" className="m-0 px-5 py-5">
							<div className="flex flex-col gap-5">
								<div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
									<AlertTriangle className="mt-0.5 size-4 shrink-0" />
									<div className="text-xs leading-5">
										<p className="font-medium">
											{t("officialSkillImport.direct.warningTitle")}
										</p>
										<p className="mt-0.5 opacity-80">
											{t("officialSkillImport.direct.warningDescription")}
										</p>
									</div>
								</div>
								<div className="flex flex-col gap-2">
									<Label
										htmlFor="official-skill-file-keys"
										className="text-sm font-medium"
									>
										{t("officialSkillImport.direct.fileKeysLabel")}
									</Label>
									<Textarea
										id="official-skill-file-keys"
										value={directFileKeys}
										onChange={(event) => setDirectFileKeys(event.target.value)}
										placeholder={t(
											"officialSkillImport.direct.fileKeysPlaceholder",
										)}
										className="min-h-[110px] resize-y font-mono text-xs"
										data-testid="official-skill-file-keys-input"
									/>
									<p className="text-xs text-muted-foreground">
										{t("officialSkillImport.direct.fileKeysHint")}
									</p>
								</div>
								<IdentityStep
									identity={identity}
									onChange={setIdentity}
									namePlaceholder={t(
										"officialSkillImport.fields.namePlaceholder",
									)}
									descriptionPlaceholder={t(
										"officialSkillImport.fields.descriptionPlaceholder",
									)}
									sourcePlaceholder={t(
										"officialSkillImport.fields.sourcePlaceholder",
									)}
								/>
								<MarketMetadataFields
									metadata={metadata}
									categories={categories}
									categoriesLoading={categoriesLoading}
									onChange={setMetadata}
								/>
								{directProgress.total > 0 ? (
									<div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
										{isSubmitting ? (
											<Loader2 className="size-3.5 animate-spin" />
										) : null}
										{t("officialSkillImport.direct.progress", {
											done: directProgress.done,
											total: directProgress.total,
										})}
										{directProgress.failed > 0 ? (
											<span className="text-destructive">
												{t("officialSkillImport.direct.failed", {
													count: directProgress.failed,
												})}
											</span>
										) : null}
									</div>
								) : null}
							</div>
						</TabsContent>
					</ScrollArea>
				</Tabs>

				<DialogFooter className="border-t border-border px-5 py-3">
					<div className="flex w-full items-center justify-between gap-3">
						<div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
							<Info className="size-3.5" />
							{t("officialSkillImport.footerHint")}
						</div>
						<div className="ml-auto flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleClose()}
								data-testid="official-skill-cancel-button"
							>
								{t("officialSkillImport.buttons.cancel")}
							</Button>
							{mode === "manual" && manualStep === "upload" ? (
								<Button
									size="sm"
									disabled={!isManualReady || uploading}
									onClick={() => setManualStep("details")}
									data-testid="official-skill-next-button"
								>
									{t("officialSkillImport.buttons.next")}
								</Button>
							) : (
								<Button
									size="sm"
									disabled={!canSubmit || isSubmitting}
									onClick={handleSubmit}
									data-testid="official-skill-submit-button"
								>
									{isSubmitting ? (
										<Loader2 className="size-4 animate-spin" />
									) : null}
									{mode === "direct"
										? t("officialSkillImport.buttons.importNow")
										: t("officialSkillImport.buttons.confirm")}
								</Button>
							)}
						</div>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default OfficialSkillImportDialog
