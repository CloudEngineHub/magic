import { useTranslation } from "react-i18next"
import { Toggle } from "@/components/shadcn-ui/toggle"
import { TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from "lucide-react"
import { TAILWIND_Z_INDEX_CLASSES } from "../../../constants/z-index"

interface TextAlignToolsProps {
	textAlign: string
	onAlign: (value: string) => void
	disabled?: boolean
}

/**
 * Text alignment tools component
 */
export function TextAlignTools({ textAlign, onAlign, disabled }: TextAlignToolsProps) {
	const { t } = useTranslation("super")

	return (
		<div className="flex items-center gap-0.5">
			<TooltipPrimitive.Root>
				<TooltipTrigger asChild>
					<span>
						<Toggle
							size="sm"
							pressed={textAlign === "left"}
							onPressedChange={() => onAlign("left")}
							disabled={disabled}
							className="h-7 w-7 rounded-md p-0"
						>
							<AlignLeft className="h-4 w-4" />
						</Toggle>
					</span>
				</TooltipTrigger>
				<TooltipContent className={TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.TOOLTIP}>
					{t("stylePanel.alignLeft")}
				</TooltipContent>
			</TooltipPrimitive.Root>
			<TooltipPrimitive.Root>
				<TooltipTrigger asChild>
					<span>
						<Toggle
							size="sm"
							pressed={textAlign === "center"}
							onPressedChange={() => onAlign("center")}
							disabled={disabled}
							className="h-7 w-7 rounded-md p-0"
						>
							<AlignCenter className="h-4 w-4" />
						</Toggle>
					</span>
				</TooltipTrigger>
				<TooltipContent className={TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.TOOLTIP}>
					{t("stylePanel.alignCenter")}
				</TooltipContent>
			</TooltipPrimitive.Root>
			<TooltipPrimitive.Root>
				<TooltipTrigger asChild>
					<span>
						<Toggle
							size="sm"
							pressed={textAlign === "right"}
							onPressedChange={() => onAlign("right")}
							disabled={disabled}
							className="h-7 w-7 rounded-md p-0"
						>
							<AlignRight className="h-4 w-4" />
						</Toggle>
					</span>
				</TooltipTrigger>
				<TooltipContent className={TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.TOOLTIP}>
					{t("stylePanel.alignRight")}
				</TooltipContent>
			</TooltipPrimitive.Root>
			<TooltipPrimitive.Root>
				<TooltipTrigger asChild>
					<span>
						<Toggle
							size="sm"
							pressed={textAlign === "justify"}
							onPressedChange={() => onAlign("justify")}
							disabled={disabled}
							className="h-7 w-7 rounded-md p-0"
						>
							<AlignJustify className="h-4 w-4" />
						</Toggle>
					</span>
				</TooltipTrigger>
				<TooltipContent className={TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.TOOLTIP}>
					{t("stylePanel.alignJustify")}
				</TooltipContent>
			</TooltipPrimitive.Root>
		</div>
	)
}
