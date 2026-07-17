import { ChevronRight, FolderOpen, X } from "lucide-react"
import type { ComponentType, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/shadcn-ui/sheet"

interface MobileRecordingImportSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onImportFiles: (files: FileList) => void
	isImporting?: boolean
	AudioUploadActionComponent: ComponentType<{
		handler: (onUpload: () => void) => ReactNode
		onFileChange?: (files: FileList) => void
	}>
}

/**
 * H5 import sheet — local file picker only, intentionally excluding APP-only
 * sources such as the photo library or cross-app import flows.
 */
export function MobileRecordingImportSheet({
	open,
	onOpenChange,
	onImportFiles,
	isImporting = false,
	AudioUploadActionComponent,
}: MobileRecordingImportSheetProps) {
	const { t } = useTranslation("super")

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				showClose={false}
				aria-describedby={undefined}
				className="flex flex-col overflow-hidden rounded-t-[14px] border-0 bg-muted p-0"
				style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
				data-testid="mobile-recording-import-sheet"
			>
				<div className="flex w-full shrink-0 flex-col items-center py-[6px]">
					<div className="h-1 w-20 rounded-full bg-muted-foreground" aria-hidden />
				</div>

				<div className="relative flex h-14 w-full shrink-0 items-center justify-center px-16 py-2">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => onOpenChange(false)}
						className="absolute left-[10px] top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-card shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)]"
						aria-label={t("mobile.recordingEntry.importSheet.closeAria")}
						data-testid="mobile-recording-import-sheet-close"
					>
						<X className="size-[22px] text-foreground" />
					</Button>

					<SheetTitle className="max-w-[247px] truncate text-center font-poppins text-[18px] font-medium leading-6 text-foreground">
						{t("mobile.recordingEntry.importSheet.title")}
					</SheetTitle>
				</div>

				<div className="px-[14px] py-[10px] pb-6">
					<div className="w-full overflow-hidden rounded-lg bg-card">
						<AudioUploadActionComponent
							onFileChange={(files) => {
								onImportFiles(files)
								onOpenChange(false)
							}}
							handler={(onUpload) => (
								<button
									type="button"
									onClick={onUpload}
									disabled={isImporting}
									className="flex min-h-[72px] w-full items-center gap-3 px-[14px] py-3 transition-opacity active:opacity-60 disabled:opacity-50"
									data-testid="mobile-recording-import-from-file"
								>
									<span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
										<FolderOpen
											className="size-6 text-blue-500"
											strokeWidth={2}
										/>
									</span>
									{/* Keep the import label stacked like the prototype so the source and scope read separately. */}
									<span className="min-w-0 flex-1 text-left">
										<span className="block truncate text-[16px] font-medium leading-5 text-foreground">
											{t("mobile.recordingEntry.importSheet.fromFiles")}
										</span>
										<span className="mt-1 block truncate text-[12px] leading-4 text-muted-foreground">
											{t("mobile.recordingEntry.importSheet.fromFilesSub")}
										</span>
									</span>
									<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
								</button>
							)}
						/>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	)
}
