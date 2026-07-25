import { Globe2, Monitor, RefreshCw, Smartphone, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/shadcn-ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { cn } from "@/lib/utils"

import type { MicroAppEntryPreviewMode } from "./MicroAppEntryPreview"

interface MicroAppPreviewToolbarProps {
	viewMode: MicroAppEntryPreviewMode
	activeFileId?: string
	htmlFiles: Array<{
		id: string
		path: string
	}>
	allowEdit: boolean
	aiEditActive?: boolean
	onViewModeChange: (mode: MicroAppEntryPreviewMode) => void
	onFileChange: (fileId: string) => void
	onRefresh: () => void
	onAIEdit: () => void
}

export default function MicroAppPreviewToolbar({
	viewMode,
	activeFileId,
	htmlFiles,
	allowEdit,
	aiEditActive = false,
	onViewModeChange,
	onFileChange,
	onRefresh,
	onAIEdit,
}: MicroAppPreviewToolbarProps) {
	const { t } = useTranslation("super")

	return (
		<div
			className="grid h-12 shrink-0 grid-cols-[minmax(max-content,1fr)_minmax(280px,640px)_minmax(max-content,1fr)] items-center gap-3 border-b border-border bg-muted/10 px-4"
			data-testid="micro-app-preview-toolbar"
		>
			<div className="flex min-w-0 items-center gap-3 justify-self-start">
				<span className="shrink-0 text-sm font-medium text-foreground">
					{t("microAppPage.previewToolbar.title")}
				</span>

				<div className="flex h-8 shrink-0 items-center rounded-md bg-muted p-0.5">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className={cn(
							"size-7 rounded-[5px] shadow-none",
							viewMode === "desktop" && "bg-background text-foreground shadow-xs",
						)}
						aria-label={t("microAppPage.previewToolbar.desktop")}
						aria-pressed={viewMode === "desktop"}
						onClick={() => onViewModeChange("desktop")}
						data-testid="micro-app-preview-desktop"
					>
						<Monitor size={16} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className={cn(
							"size-7 rounded-[5px] shadow-none",
							viewMode === "phone" && "bg-background text-foreground shadow-xs",
						)}
						aria-label={t("microAppPage.previewToolbar.phone")}
						aria-pressed={viewMode === "phone"}
						onClick={() => onViewModeChange("phone")}
						data-testid="micro-app-preview-phone"
					>
						<Smartphone size={16} />
					</Button>
				</div>
			</div>

			<Select
				value={activeFileId || ""}
				onValueChange={onFileChange}
				disabled={htmlFiles.length === 0}
			>
				<SelectTrigger
					size="sm"
					className="h-8 w-full min-w-0 justify-between bg-background px-3 shadow-none"
					aria-label={t("microAppPage.previewToolbar.address")}
					data-testid="micro-app-preview-address"
				>
					<span className="flex min-w-0 flex-1 items-center gap-2 text-left">
						<Globe2 className="size-4 shrink-0 text-muted-foreground" />
						<SelectValue
							className="min-w-0 flex-1 truncate text-left"
							placeholder={t("microAppPage.previewToolbar.noHtml")}
						/>
					</span>
				</SelectTrigger>
				<SelectContent align="center" className="max-h-72">
					{htmlFiles.map((file) => (
						<SelectItem key={file.id} value={file.id}>
							{file.path}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<div className="flex items-center gap-2 justify-self-end">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8 shrink-0"
							aria-label={t("microAppPage.previewToolbar.refresh")}
							onClick={onRefresh}
							data-testid="micro-app-preview-refresh"
						>
							<RefreshCw size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("microAppPage.previewToolbar.refresh")}
					</TooltipContent>
				</Tooltip>

				<Button
					type="button"
					variant={aiEditActive ? "secondary" : "outline"}
					size="sm"
					className="h-8 shrink-0 gap-1.5 px-3 text-sm shadow-none"
					disabled={!allowEdit}
					aria-pressed={aiEditActive}
					onClick={onAIEdit}
					data-testid="micro-app-preview-ai-edit"
				>
					<Sparkles size={15} />
					{t("microAppPage.previewToolbar.aiEdit")}
				</Button>
			</div>
		</div>
	)
}
