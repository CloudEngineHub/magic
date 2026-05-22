import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import type { ReferenceFileValue, VisualPresetOption } from "../../types"
import ReferenceFilePicker from "./ReferenceFilePicker"

/** Miniature preview thumbnails that mimic the actual template styles */
function PresetThumbnail({ value }: { value: string }) {
	switch (value) {
		case "neo-brutalism":
			// Ruled-paper background + bold black border box + yellow highlight
			return (
				<div className="relative h-full w-full overflow-hidden rounded-md bg-[#FAFAF8]">
					{/* Ruled lines */}
					<div
						className="absolute inset-0"
						style={{
							backgroundImage:
								"repeating-linear-gradient(transparent, transparent 5px, #E0E0DE 5px, #E0E0DE 5.5px)",
						}}
					/>
					{/* Red margin line */}
					<div className="absolute bottom-0 left-[14%] top-0 w-[1px] bg-red-400/30" />
					{/* Content block with hard shadow */}
					<div className="relative z-[1] mx-auto mt-2 flex h-[60%] w-[70%] flex-col items-center justify-center">
						<div className="w-full rounded-sm border-[1.5px] border-black/70 bg-white px-1 py-0.5 shadow-[1.5px_1.5px_0_rgba(0,0,0,0.7)]">
							<div className="h-[3px] w-[60%] rounded-full bg-black/70" />
							<div className="mt-[2px] h-[2px] w-[80%] rounded-full bg-black/30" />
						</div>
						{/* Yellow highlight bar */}
						<div className="mt-1 h-[3px] w-[50%] bg-[#FFE566]" />
					</div>
				</div>
			)

		case "code-dispatch":
			// Black/white + red accent, monospace code lines, no border-radius
			return (
				<div className="relative h-full w-full overflow-hidden rounded-md bg-white">
					{/* Grid texture */}
					<div
						className="absolute inset-0 opacity-[0.08]"
						style={{
							backgroundImage:
								"linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)",
							backgroundSize: "6px 6px",
						}}
					/>
					{/* Top red bar */}
					<div className="absolute left-0 right-0 top-0 h-[3px] bg-[#DD0000]" />
					{/* Content lines */}
					<div className="relative z-[1] flex flex-col gap-[3px] px-1.5 pt-2.5">
						<div className="h-[2px] w-[55%] bg-black/80" />
						<div className="h-[2px] w-[70%] bg-black/40" />
						<div className="h-[2px] w-[40%] bg-black/40" />
						<div className="mt-0.5 h-[2px] w-[30%] bg-[#DD0000]/70" />
					</div>
				</div>
			)

		case "dark-tech":
			// Deep black + gold accent, thin borders, heavy/light contrast
			return (
				<div className="relative h-full w-full overflow-hidden rounded-md bg-[#0a0a0f]">
					{/* Subtle grid */}
					<div
						className="absolute inset-0 opacity-[0.15]"
						style={{
							backgroundImage:
								"linear-gradient(#242424 1px, transparent 1px), linear-gradient(90deg, #242424 1px, transparent 1px)",
							backgroundSize: "8px 8px",
						}}
					/>
					{/* Gold accent bar */}
					<div className="absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-[#d4b07a] to-[#f0d090]" />
					{/* Content */}
					<div className="relative z-[1] flex flex-col gap-[3px] px-1.5 pt-2">
						<div className="h-[2.5px] w-[50%] rounded-full bg-white/90" />
						<div className="h-[2px] w-[65%] rounded-full bg-white/30" />
						<div className="mt-1 flex gap-[3px]">
							<div className="h-3 w-3 rounded-[2px] border border-[#d4b07a]/60 bg-[#131313]" />
							<div className="h-3 w-3 rounded-[2px] border border-[#242424] bg-[#131313]" />
						</div>
					</div>
				</div>
			)

		case "ins-modern":
			// Clean white + bold border frame + large rounded corners, hard shadow
			return (
				<div className="relative h-full w-full overflow-hidden rounded-md bg-[#fafafa]">
					{/* Outer frame border */}
					<div className="absolute inset-[3px] rounded-[4px] border-[1.5px] border-[#111]" />
					{/* Content */}
					<div className="relative z-[1] flex h-full flex-col items-center justify-center gap-[3px]">
						<div className="h-[3px] w-[55%] rounded-full bg-[#111]" />
						<div className="h-[2px] w-[40%] rounded-full bg-[#555]/60" />
						<div className="mt-0.5 h-2 w-2 rounded-full bg-[#e1306c]/60" />
					</div>
				</div>
			)

		case "custom":
			return (
				<div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-white">
					<div className="absolute inset-[4px] rounded border border-zinc-900" />
					<div className="h-3 w-7 -rotate-6 rounded-sm border border-zinc-900 bg-primary" />
				</div>
			)

		case "none":
		default:
			return (
				<div className="flex h-full w-full items-center justify-center rounded-md bg-muted/50">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						className="text-muted-foreground/50"
					>
						<circle cx="12" cy="12" r="10" strokeDasharray="3 3" />
						<line x1="8" y1="12" x2="16" y2="12" />
					</svg>
				</div>
			)
	}
}

interface VisualPresetPickerProps {
	presets: VisualPresetOption[]
	value: string
	onChange: (value: string) => void
	/** Custom description text for "custom" mode */
	customDescription?: string
	onCustomDescriptionChange?: (value: string) => void
	/** Visual reference files for "custom" mode */
	visualReferenceFiles?: ReferenceFileValue[]
	onVisualReferenceFilesChange?: (files: ReferenceFileValue[]) => void
	/** Size variant */
	size?: "sm" | "md"
}

export default function VisualPresetPicker({
	presets,
	value,
	onChange,
	customDescription,
	onCustomDescriptionChange,
	visualReferenceFiles,
	onVisualReferenceFilesChange,
	size = "sm",
}: VisualPresetPickerProps) {
	const { t } = useTranslation("super")
	const selected = value || "none"
	const isMd = size === "md"

	return (
		<div>
			<div className={cn("grid gap-1.5", isMd ? "grid-cols-2 gap-2" : "grid-cols-3")}>
				{presets.map((preset) => {
					const isSelected = selected === preset.value
					return (
						<Tooltip key={preset.value}>
							<TooltipTrigger asChild>
								<button
									type="button"
									className={cn(
										"group relative flex items-center gap-2 overflow-hidden bg-zinc-50/60 text-left transition-all duration-200 hover:bg-zinc-100",
										isMd ? "py-2 pl-2 pr-2.5" : "py-1.5 pl-1.5 pr-2",
										isSelected && "bg-primary/30",
									)}
									onClick={() => onChange(preset.value)}
								>
									{/* Thumbnail preview */}
									<div
										className={cn(
											"shrink-0 rounded",
											isMd ? "h-10 w-10" : "h-8 w-8",
										)}
									>
										<PresetThumbnail value={preset.value} />
									</div>
									{/* Title */}
									<span
										className={cn(
											"min-w-0 flex-1 truncate font-bold leading-tight",
											isMd ? "text-xs" : "text-[11px]",
											isSelected ? "text-zinc-950" : "text-foreground",
										)}
									>
										{t(preset.labelKey)}
									</span>
									{/* Selected indicator */}
									{isSelected && (
										<div className="h-4.5 w-4.5 absolute right-1 top-1 flex items-center justify-center bg-zinc-950 text-white">
											<svg
												width="8"
												height="8"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="3"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<polyline points="20 6 9 17 4 12" />
											</svg>
										</div>
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="max-w-[200px] text-xs">
								{t(preset.descriptionKey)}
							</TooltipContent>
						</Tooltip>
					)
				})}
			</div>

			{/* Custom mode inputs */}
			{selected === "custom" && onCustomDescriptionChange && (
				<div className={cn(isMd ? "mt-3" : "mt-2")}>
					<div
						className={cn(
							"flex w-full items-center gap-2 border-b border-zinc-200 bg-zinc-50/40 transition-all focus-within:border-zinc-950 focus-within:bg-primary/[0.03]",
							isMd ? "py-2 pl-4 pr-2" : "py-1.5 pl-3 pr-1.5",
						)}
					>
						<input
							type="text"
							className={cn(
								"min-w-0 flex-1 bg-transparent placeholder:text-muted-foreground/60 focus:outline-none",
								isMd ? "text-sm" : "text-xs",
							)}
							placeholder={t(
								"detail.selfMedia.initPanel.stepDetail.visualCustomPlaceholder",
							)}
							value={customDescription ?? ""}
							onChange={(e) => onCustomDescriptionChange(e.target.value)}
						/>
						{onVisualReferenceFilesChange && (
							<div className="shrink-0">
								<ReferenceFilePicker
									compact
									label={t(
										"detail.selfMedia.initPanel.stepDetail.visualReferenceLabel",
									)}
									value={visualReferenceFiles || []}
									onChange={onVisualReferenceFilesChange}
								/>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
