import type { AssetItem } from "@/apis"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { cn } from "@/utils/cn"
import {
	Check,
	Ellipsis,
	Image as ImageIcon,
	LoaderCircle,
	Music2,
	Play,
	ShieldAlert,
	ShieldCheck,
	Video,
} from "lucide-react"
import { useState } from "react"
import type { TFunction } from "../../../public/i18n-types"
import { rememberAssetMediaDimensions } from "../../../runtime/resources/asset/assetMediaDimensionCache"
import { formatAssetDuration } from "./assetLibraryMedia"

interface AssetLibraryAssetCardProps {
	asset: AssetItem
	selected: boolean
	selectionBlocked: boolean
	t: TFunction
	manageable?: boolean
	onToggle: (assetId: string) => void
	onPreview: (asset: AssetItem) => void
	onEdit?: (asset: AssetItem) => void
	onTransferOwner?: (asset: AssetItem) => void
	onDelete?: (asset: AssetItem) => void
	onMenuOpenChange?: (open: boolean) => void
}

function getAssetSourceLabel(asset: AssetItem, t: TFunction): string {
	if (asset.source === "TEAM") return t("assets.teamVisible", "团队可见")
	if (asset.source === "PUBLIC") return t("assets.publicVisible", "官方公开")
	return t("assets.personalVisible", "仅自己可见")
}

function getAssetComplianceLabel(asset: AssetItem, t: TFunction): string {
	switch (asset.compliance_status) {
		case "PASS":
			return t("assets.compliancePassed", "已通过合规检查")
		case "PROCESSING":
			return t("assets.complianceProcessing", "合规校验中")
		case "FAILED":
			return t("assets.complianceFailed", "合规校验失败")
		default:
			return t("assets.complianceUnverified", "未校验")
	}
}

function FullscreenCornersIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
			<path
				d="M4 0.75H0.75V4 M10 0.75H13.25V4 M0.75 10V13.25H4 M13.25 10V13.25H10"
				fill="none"
				stroke="#FAFAFA"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

export function AssetLibraryAssetCard({
	asset,
	selected,
	selectionBlocked,
	t,
	manageable = false,
	onToggle,
	onPreview,
	onEdit,
	onTransferOwner,
	onDelete,
	onMenuOpenChange,
}: AssetLibraryAssetCardProps) {
	const [durationLabel, setDurationLabel] = useState("")
	const mediaLabel =
		asset.asset_media_type === "VIDEO"
			? t("assets.mediaVideo", "视频")
			: asset.asset_media_type === "AUDIO"
				? t("assets.mediaAudio", "音频")
				: t("assets.mediaImage", "图片")
	const sourceLabel = getAssetSourceLabel(asset, t)
	const complianceLabel = getAssetComplianceLabel(asset, t)

	return (
		<div
			role="button"
			tabIndex={selectionBlocked ? -1 : 0}
			aria-pressed={selected}
			className={cn(
				"flex h-[360px] flex-col overflow-hidden rounded-xl border bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				selected && "border-primary ring-2 ring-primary/15",
				!selected && "hover:border-primary/60",
				selectionBlocked && "cursor-not-allowed opacity-60",
			)}
			onClick={() => {
				if (!selectionBlocked) onToggle(asset.asset_id)
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault()
					if (!selectionBlocked) onToggle(asset.asset_id)
				}
			}}
		>
			<div className="group relative h-[260px] shrink-0 overflow-hidden bg-muted">
				{asset.file_url ? (
					asset.asset_media_type === "VIDEO" ? (
						<video
							className="block size-full object-contain"
							src={asset.file_url}
							aria-label={asset.name}
							muted
							playsInline
							preload="metadata"
							onLoadedMetadata={(event) => {
								const video = event.currentTarget
								rememberAssetMediaDimensions(asset.asset_id, {
									width: video.videoWidth,
									height: video.videoHeight,
								})
								const label = formatAssetDuration(video.duration)
								if (label) setDurationLabel(label)
							}}
						/>
					) : asset.asset_media_type === "AUDIO" ? (
						<div className="flex size-full items-center justify-center">
							<Music2 className="size-12 text-muted-foreground" />
						</div>
					) : (
						<img
							className="block size-full object-contain"
							src={asset.file_url}
							alt={asset.name}
							onLoad={(event) => {
								const image = event.currentTarget
								rememberAssetMediaDimensions(asset.asset_id, {
									width: image.naturalWidth,
									height: image.naturalHeight,
								})
							}}
						/>
					)
				) : (
					<div className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-accent">
						{asset.asset_media_type === "VIDEO" ? (
							<Video className="size-12 text-muted-foreground" />
						) : asset.asset_media_type === "AUDIO" ? (
							<Music2 className="size-12 text-muted-foreground" />
						) : (
							<ImageIcon className="size-12 text-muted-foreground" />
						)}
					</div>
				)}
				{selected ? (
					<span className="absolute left-2.5 top-2.5 inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
						<Check className="size-4" aria-hidden="true" />
					</span>
				) : null}
				<div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
					<span
						className={cn(
							"inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs leading-4 shadow-sm",
							asset.compliance_status === "PASS" &&
								"bg-primary text-primary-foreground",
							asset.compliance_status === "PROCESSING" &&
								"bg-background/90 text-foreground",
							asset.compliance_status === "FAILED" &&
								"bg-destructive text-destructive-foreground",
							asset.compliance_status === "UNVERIFIED" &&
								"bg-background/90 text-muted-foreground",
						)}
						title={asset.compliance_failed_reason ?? undefined}
						aria-label={complianceLabel}
					>
						{asset.compliance_status === "PASS" ? (
							<ShieldCheck className="size-3.5" />
						) : asset.compliance_status === "FAILED" ? (
							<ShieldAlert className="size-3.5" />
						) : asset.compliance_status === "PROCESSING" ? (
							<LoaderCircle className="size-3.5 animate-spin" />
						) : null}
						{complianceLabel}
					</span>
					{manageable ? (
						<DropdownMenu modal={false} onOpenChange={onMenuOpenChange}>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-label={t("assets.actions", "素材操作")}
									onPointerDown={(event) => event.stopPropagation()}
									onClick={(event) => event.stopPropagation()}
								>
									<Ellipsis className="size-4" aria-hidden="true" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={(event) => event.stopPropagation()}
							>
								<DropdownMenuItem onSelect={() => onEdit?.(asset)}>
									{t("assets.edit", "编辑素材")}
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => onTransferOwner?.(asset)}>
									{t("assets.transferOwner", "转移归属人")}
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									onSelect={() => onDelete?.(asset)}
								>
									{t("assets.delete", "删除素材")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
				</div>
				{asset.asset_media_type === "VIDEO" ? (
					<span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-xs leading-4 text-white">
						<Play className="size-3 fill-white" aria-hidden="true" />
						{durationLabel || null}
					</span>
				) : null}
				{asset.compliance_status === "FAILED" && asset.compliance_failed_reason ? (
					<span className="absolute inset-x-2.5 bottom-10 line-clamp-2 rounded-md bg-black/65 px-2 py-1 text-xs leading-4 text-white">
						{asset.compliance_failed_reason}
					</span>
				) : null}
				{asset.file_url && asset.asset_media_type !== "AUDIO" ? (
					<button
						type="button"
						className="absolute bottom-2.5 right-2.5 inline-flex size-6 items-center justify-center rounded-lg bg-[rgba(0,0,0,0.70)] opacity-0 transition-opacity hover:bg-[rgba(0,0,0,0.85)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
						aria-label={t("assets.preview", "放大预览")}
						onClick={(event) => {
							event.stopPropagation()
							onPreview(asset)
						}}
					>
						<FullscreenCornersIcon />
					</button>
				) : null}
			</div>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
				<div className="truncate text-base font-semibold leading-6" title={asset.name}>
					{asset.name}
				</div>
				<div className="mt-1 truncate text-[13px] leading-5 text-muted-foreground">
					{mediaLabel} · {sourceLabel}
				</div>
				<div className="mt-2 flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-hidden">
					{asset.tags.map((tag) => (
						<span
							key={tag.id}
							className="rounded bg-accent px-1.5 py-0.5 text-xs leading-[18px] text-primary"
						>
							{tag.name}
						</span>
					))}
				</div>
			</div>
		</div>
	)
}
