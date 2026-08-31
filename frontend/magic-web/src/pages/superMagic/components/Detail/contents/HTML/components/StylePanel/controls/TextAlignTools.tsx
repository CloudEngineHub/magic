import { useTranslation } from "react-i18next"
import { Toggle } from "@/components/shadcn-ui/toggle"
import { TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import {
	AlignCenter,
	AlignHorizontalJustifyCenter,
	AlignHorizontalJustifyEnd,
	AlignHorizontalJustifyStart,
	AlignJustify,
	AlignLeft,
	AlignRight,
	AlignVerticalJustifyCenter,
	AlignVerticalJustifyEnd,
	AlignVerticalJustifyStart,
} from "lucide-react"
import { TAILWIND_Z_INDEX_CLASSES } from "../../../constants/z-index"
import { STYLE_PANEL_STYLES } from "../styles"

interface TextAlignToolsProps {
	value: string
	onAlign: (value: string) => void
	disabled?: boolean
	mode?: "text" | "flex"
	flexDirection?: string
	/** Context toolbars omit justify to keep the frequent-action row compact. */
	compact?: boolean
}

/**
 * Text alignment tools component
 */
export function TextAlignTools({
	value,
	onAlign,
	disabled,
	mode = "text",
	flexDirection = "row",
	compact = false,
}: TextAlignToolsProps) {
	const { t } = useTranslation("super")
	const isFlex = mode === "flex"
	const isVertical = flexDirection.includes("column")
	const isReverse = flexDirection.endsWith("reverse")
	const flexValues = isReverse
		? ["flex-end", "center", "flex-start"]
		: ["flex-start", "center", "flex-end"]
	const flexIcons = isVertical
		? [AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd]
		: [AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd]
	const getFlexLabel = (flexValue: string) =>
		t(
			`stylePanel.layoutValues.${
				flexValue === "flex-start"
					? "flexStart"
					: flexValue === "flex-end"
						? "flexEnd"
						: "center"
			}`,
		)
	const getTextLabel = (textValue: string) =>
		t(
			`stylePanel.${
				textValue === "left"
					? "alignLeft"
					: textValue === "right"
						? "alignRight"
						: textValue === "justify"
							? "alignJustify"
							: "alignCenter"
			}`,
		)
	const renderTooltip = (label: string) => (
		<TooltipContent className={TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.TOOLTIP}>
			{label}
		</TooltipContent>
	)

	if (isFlex) {
		return (
			<div className="flex items-center gap-0.5">
				{flexValues.map((flexValue, index) => {
					const Icon = flexIcons[index]
					const label = `${t("stylePanel.justifyContent")}: ${getFlexLabel(flexValue)}`
					return (
						<TooltipPrimitive.Root key={flexValue}>
							<TooltipTrigger asChild>
								<span>
									<Toggle
										size="sm"
										pressed={value === flexValue}
										onPressedChange={() => onAlign(flexValue)}
										disabled={disabled}
										className={STYLE_PANEL_STYLES.iconButton}
									>
										<Icon className="h-4 w-4" />
									</Toggle>
								</span>
							</TooltipTrigger>
							{renderTooltip(label)}
						</TooltipPrimitive.Root>
					)
				})}
			</div>
		)
	}

	return (
		<div className="flex items-center gap-0.5">
			<TooltipPrimitive.Root>
				<TooltipTrigger asChild>
					<span>
						<Toggle
							size="sm"
							pressed={value === "left"}
							onPressedChange={() => onAlign("left")}
							disabled={disabled}
							className={STYLE_PANEL_STYLES.iconButton}
						>
							<AlignLeft className="h-4 w-4" />
						</Toggle>
					</span>
				</TooltipTrigger>
				{renderTooltip(getTextLabel("left"))}
			</TooltipPrimitive.Root>
			<TooltipPrimitive.Root>
				<TooltipTrigger asChild>
					<span>
						<Toggle
							size="sm"
							pressed={value === "center"}
							onPressedChange={() => onAlign("center")}
							disabled={disabled}
							className={STYLE_PANEL_STYLES.iconButton}
						>
							<AlignCenter className="h-4 w-4" />
						</Toggle>
					</span>
				</TooltipTrigger>
				{renderTooltip(getTextLabel("center"))}
			</TooltipPrimitive.Root>
			<TooltipPrimitive.Root>
				<TooltipTrigger asChild>
					<span>
						<Toggle
							size="sm"
							pressed={value === "right"}
							onPressedChange={() => onAlign("right")}
							disabled={disabled}
							className={STYLE_PANEL_STYLES.iconButton}
						>
							<AlignRight className="h-4 w-4" />
						</Toggle>
					</span>
				</TooltipTrigger>
				{renderTooltip(getTextLabel("right"))}
			</TooltipPrimitive.Root>
			{compact ? null : (
				<TooltipPrimitive.Root>
					<TooltipTrigger asChild>
						<span>
							<Toggle
								size="sm"
								pressed={value === "justify"}
								onPressedChange={() => onAlign("justify")}
								disabled={disabled}
								className={STYLE_PANEL_STYLES.iconButton}
							>
								<AlignJustify className="h-4 w-4" />
							</Toggle>
						</span>
					</TooltipTrigger>
					{renderTooltip(getTextLabel("justify"))}
				</TooltipPrimitive.Root>
			)}
		</div>
	)
}
