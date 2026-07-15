import { useTranslation } from "react-i18next"
import { Label } from "@/components/shadcn-ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/shadcn-ui/radio-group"
import { cn } from "@/lib/utils"
import { selfMediaOverlayStyles } from "./selfMediaOverlayStyles"

type ExportType = "cardsZip" | "longImage"
type SelectedExportType = ExportType | "wechatCoverImage"

const EXPORT_TYPE_OPTIONS: ExportType[] = ["cardsZip", "longImage"]

interface ExportOptionsSectionsProps {
	isWechatOfficialMode: boolean
	exportType: SelectedExportType
	onExportTypeChange: (value: ExportType) => void
	pixelRatio: number
	onPixelRatioChange: (value: number) => void
	isExporting: boolean
	hintW: number
	hintH: number
}

export default function ExportOptionsSections({
	isWechatOfficialMode,
	exportType,
	onExportTypeChange,
	pixelRatio,
	onPixelRatioChange,
	isExporting,
	hintW,
	hintH,
}: ExportOptionsSectionsProps) {
	const { t } = useTranslation("super")

	return (
		<>
			{!isWechatOfficialMode ? (
				<div
					className="flex shrink-0 flex-col gap-2 px-4 pt-4 sm:px-6"
					data-testid="self-media-export-type-section"
				>
					<Label className="text-xs font-medium text-muted-foreground">
						{t("detail.selfMedia.export.typeLabel")}
					</Label>
					<RadioGroup
						value={exportType}
						onValueChange={(value) => {
							if (EXPORT_TYPE_OPTIONS.includes(value as ExportType)) {
								onExportTypeChange(value as ExportType)
							}
						}}
						className="grid grid-cols-1 gap-2 sm:grid-cols-2"
						data-testid="self-media-export-type-group"
					>
						{EXPORT_TYPE_OPTIONS.map((type) => {
							const id = `self-media-export-type-${type}`
							const checked = exportType === type
							return (
								<Label
									key={type}
									htmlFor={id}
									data-testid={
										type === "longImage"
											? "self-media-export-type-long-image"
											: "self-media-export-type-cards-zip"
									}
									className={cn(
										"flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3 text-sm transition-colors",
										checked &&
											"border-primary bg-primary/5 ring-1 ring-primary/40",
										isExporting && "cursor-not-allowed opacity-60",
									)}
								>
									<RadioGroupItem
										id={id}
										value={type}
										disabled={isExporting}
										className="mt-0.5"
									/>
									<span className="flex min-w-0 flex-col gap-1">
										<span className="font-medium text-foreground">
											{t(`detail.selfMedia.export.type.${type}.title`)}
										</span>
										<span className="text-xs leading-5 text-muted-foreground">
											{t(`detail.selfMedia.export.type.${type}.description`)}
										</span>
									</span>
								</Label>
							)
						})}
					</RadioGroup>
				</div>
			) : null}

			<div
				className="flex w-full shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 px-4 py-3 text-xs font-medium text-muted-foreground sm:px-6"
				data-testid="self-media-export-scale-section"
			>
				{t("detail.selfMedia.export.scaleLabel")}
				<RadioGroup
					value={String(pixelRatio)}
					onValueChange={(value) => onPixelRatioChange(Number(value))}
					className="flex shrink-0 flex-wrap justify-end gap-x-4 gap-y-2"
					data-testid="self-media-export-scale-group"
				>
					{[1, 2, 4].map((ratio) => {
						const id = `self-media-export-scale-${ratio}x`
						const outW = hintW * ratio
						const outH = hintH * ratio
						return (
							<div key={ratio} className="flex items-center gap-2">
								<RadioGroupItem
									id={id}
									value={String(ratio)}
									disabled={isExporting}
									data-testid={`self-media-export-scale-option-${ratio}x`}
								/>
								<Label
									htmlFor={id}
									className="flex cursor-pointer items-center gap-2 text-sm"
								>
									<span>
										{t("detail.selfMedia.export.scaleOption", { ratio })}
									</span>
									<span
										className="text-xs font-normal tabular-nums text-muted-foreground"
										data-testid={`self-media-export-scale-size-${ratio}x`}
									>
										{t("detail.selfMedia.export.scaleOutputSize", {
											width: outW,
											height: outH,
										})}
									</span>
								</Label>
							</div>
						)
					})}
				</RadioGroup>
			</div>
		</>
	)
}
