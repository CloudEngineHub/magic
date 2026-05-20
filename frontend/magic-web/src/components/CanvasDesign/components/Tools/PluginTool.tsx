import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { Puzzle } from "lucide-react"
import { useMemo, useState, useSyncExternalStore } from "react"

import {
	normalizePluginLocale,
	resolvePluginIcon,
	resolvePluginText,
} from "../../canvas/plugins/resolve"
import { useCanvas } from "../../context/CanvasContext"
import { useCanvasDesignI18n } from "../../context/I18nContext"
import { useHostUiLocale } from "../../context/HostUiLocaleContext"
import IconButton from "../ui/custom/IconButton"
import { usePortalContainer } from "../ui/custom/PortalContainerContext"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"
import styles from "./index.module.css"

const noop = () => undefined

export default function PluginTool() {
	const { t } = useCanvasDesignI18n()
	const { canvas } = useCanvas()
	const hostUiLocale = useHostUiLocale()
	const portalContainer = usePortalContainer()
	const [open, setOpen] = useState(false)
	const pluginSnapshot = useSyncExternalStore(
		(listener) => canvas?.pluginManager.subscribe(listener) ?? noop,
		() => canvas?.pluginManager.getSnapshot(),
		() => undefined,
	)

	const locale = normalizePluginLocale(hostUiLocale)
	const plugins = useMemo(() => {
		return (pluginSnapshot?.plugins ?? []).map((plugin) => {
			return {
				...plugin,
				resolvedLabel: resolvePluginText(plugin, plugin.label, locale),
				resolvedDescription: resolvePluginText(plugin, plugin.description, locale),
				resolvedIcon: resolvePluginIcon(plugin),
			}
		})
	}, [locale, pluginSnapshot?.plugins])

	const label = t("tools.plugins", "插件")

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<div>
							<IconButton className={styles.toolItem} selected={open}>
								<Puzzle size={16} />
							</IconButton>
						</div>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipPrimitive.Portal container={portalContainer || undefined}>
					<TooltipContent side="right" sideOffset={8} className="border-black bg-black">
						<div>
							<span className={styles.tooltipLabel}>{label}</span>
						</div>
						<TooltipPrimitive.Arrow className="fill-black" />
					</TooltipContent>
				</TooltipPrimitive.Portal>
			</Tooltip>

			<PopoverContent
				align="start"
				side="right"
				sideOffset={8}
				className="border-base-border w-80 bg-white p-0"
			>
				<div className={styles.pluginPanel}>
					<div className={styles.pluginPanelHeader}>
						<div className={styles.pluginPanelTitle}>{label}</div>
					</div>

					<div className={styles.pluginList}>
						{plugins.map((plugin) => {
							return (
								<button
									key={plugin.name}
									type="button"
									className={styles.pluginItem}
									onClick={() => {
										canvas?.pluginManager.open(plugin.name)
										setOpen(false)
									}}
								>
									<div className={styles.pluginIcon}>
										{plugin.resolvedIcon?.type === "emoji" ? (
											plugin.resolvedIcon.value
										) : plugin.resolvedIcon?.type === "image" ? (
											<img
												src={plugin.resolvedIcon.value}
												alt=""
												className={styles.pluginIconImage}
											/>
										) : (
											<Puzzle size={18} />
										)}
									</div>
									<div className={styles.pluginInfo}>
										<div className={styles.pluginName}>
											{plugin.resolvedLabel}
										</div>
										<div className={styles.pluginDescription}>
											{plugin.resolvedDescription}
										</div>
									</div>
								</button>
							)
						})}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}
