import type { LucideIcon } from "lucide-react"
import { Moon, Sun, SunMoon } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import { useTheme } from "@/models/config/hooks"
import type { ThemeMode } from "antd-style"
import { IS_DARK_MODE_DISABLED } from "@/constants/theme"
import { isDev } from "@/utils/env"
import { MagicTooltip } from "@/components/base"
import { useActionButtonsMenu } from "./useActionButtonsMenu"
interface ActionButtonsProps {
	collapsed: boolean
}

const THEME_CYCLE: ThemeMode[] = ["light", "dark", "auto"]

const THEME_ICON_MAP: Record<ThemeMode, LucideIcon> = {
	light: Sun,
	dark: Moon,
	auto: SunMoon,
}

function ActionButtons({ collapsed }: ActionButtonsProps) {
	const { t } = useTranslation("sidebar")
	const { theme, setTheme } = useTheme()

	function handleThemeToggle() {
		if (IS_DARK_MODE_DISABLED) return
		const currentIndex = THEME_CYCLE.indexOf(theme)
		const nextIndex = (currentIndex + 1) % THEME_CYCLE.length
		setTheme(THEME_CYCLE[nextIndex])
	}

	const themeLabel = {
		light: t("footer.themeLight"),
		dark: t("footer.themeDark"),
		auto: t("footer.themeAuto"),
	}[theme]

	const ThemeIcon = THEME_ICON_MAP[theme] ?? Sun

	const actionItems = useActionButtonsMenu()

	return (
		<div
			className="flex w-full shrink-0 flex-col px-0 py-1"
			data-testid="sidebar-action-buttons"
		>
			{/* 按入口的实际文字宽度换行；长语言保留完整名称，不依赖侧栏断点。 */}
			<div
				className={cn(
					"flex w-full shrink-0 gap-1",
					collapsed ? "flex-col items-center" : "flex-wrap",
				)}
			>
				{actionItems.map((item) => {
					const Icon = item.icon
					return (
						<MagicTooltip
							key={item.id}
							title={
								item.id === "recycle-bin" ? (
									collapsed ? (
										<>
											{t("footer.globalRecycleBin")}
											<br />
											{t("footer.globalRecycleBinHint")}
										</>
									) : (
										t("footer.globalRecycleBinHint")
									)
								) : collapsed ? (
									t(item.label)
								) : undefined
							}
							placement="right"
						>
							<Button
								aria-label={
									item.id === "recycle-bin"
										? t("footer.globalRecycleBin")
										: t(item.label)
								}
								variant="ghost"
								size={collapsed ? "icon" : "sm"}
								data-testid={`sidebar-action-${item.id}`}
								className={cn(
									"h-8 shrink-0 gap-2 text-[13px] font-normal leading-5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
									collapsed
										? "w-8"
										: "min-w-max flex-[1_0_auto] justify-start px-2",
								)}
								onClick={item.onClick}
							>
								<Icon className="h-4 w-4 text-sidebar-foreground" />
								{!collapsed && (
									<span className="text-[13px] text-sidebar-foreground">
										{item.id === "recycle-bin"
											? t("footer.globalRecycleBin")
											: t(item.label)}
									</span>
								)}
							</Button>
						</MagicTooltip>
					)
				})}

				{isDev && (
					<MagicTooltip title="当前仅在开发环境开启" placement="right">
						<Button
							variant="ghost"
							size={collapsed ? "icon" : "sm"}
							data-testid="sidebar-action-theme"
							aria-label={themeLabel}
							className={cn(
								"h-8 shrink-0 gap-2 text-[13px] font-normal leading-5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
								collapsed ? "w-8" : "w-full basis-full justify-start px-2",
							)}
							onClick={handleThemeToggle}
						>
							<ThemeIcon className="h-4 w-4 text-sidebar-foreground" />
							{!collapsed && (
								<span className="text-[13px] text-sidebar-foreground">
									{themeLabel}
								</span>
							)}
						</Button>
					</MagicTooltip>
				)}
			</div>
		</div>
	)
}

export default ActionButtons
