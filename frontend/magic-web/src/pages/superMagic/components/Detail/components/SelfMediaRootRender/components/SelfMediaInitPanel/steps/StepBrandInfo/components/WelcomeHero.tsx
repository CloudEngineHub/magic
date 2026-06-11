import { useTranslation } from "react-i18next"
import { Compass, LayoutGrid, Lightbulb, Sparkles } from "lucide-react"
import { Badge } from "@/components/shadcn-ui/badge"

export function WelcomeHero() {
	const { t } = useTranslation("super")
	const features = featureDefinitions.map((feature) => ({
		icon: feature.icon,
		title: t(feature.titleKey, feature.titleFallback),
		desc: t(feature.descKey, feature.descFallback),
	}))

	return (
		<div
			className="relative overflow-hidden rounded-lg bg-[#434c81]/[0.055] p-4 sm:p-5"
			data-testid="self-media-welcome-hero"
		>
			<div className="relative z-[1] grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
				<div className="space-y-5">
					<Badge
						variant="secondary"
						className="rounded-md bg-background/70 text-[#3c456f]"
						data-testid="self-media-welcome-badge"
					>
						<Sparkles size={12} className="text-[#434c81]" />
						<span>{t("detail.selfMedia.initPanel.welcome.tag", "AI 创作助手")}</span>
					</Badge>
					<div className="max-w-2xl space-y-3">
						<h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
							{t(
								"detail.selfMedia.initPanel.welcome.title",
								"开启你的自媒体矩阵创作",
							)}
						</h1>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t(
								"detail.selfMedia.initPanel.welcome.subtitle",
								"超级麦吉自媒体助手帮你配置专属 AI 创作助手，从定位、选题到成文，打造一站式爆款内容工坊。",
							)}
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-3">
						{features.map((item, idx) => {
							const Icon = item.icon
							return (
								<div
									key={idx}
									className="group rounded-lg bg-background/65 p-3 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:bg-background/80 hover:shadow-[0_10px_28px_rgba(15,23,42,0.06)]"
									data-testid="self-media-welcome-feature"
								>
									<div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-[#434c81]/[0.105] text-[#434c81] transition-transform duration-200 group-hover:rotate-[-3deg] group-hover:scale-105">
										<Icon size={15} />
									</div>
									<h3 className="text-sm font-medium text-foreground">
										{item.title}
									</h3>
									<p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
										{item.desc}
									</p>
								</div>
							)
						})}
					</div>
				</div>
				<div
					className="mx-auto hidden h-full min-h-[180px] w-full rounded-lg bg-background/55 p-4 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:bg-background/70 hover:shadow-[0_12px_32px_rgba(15,23,42,0.065)] md:flex md:flex-col md:justify-between"
					data-testid="self-media-welcome-preview"
				>
					<div className="flex items-center justify-between">
						<span className="h-2 w-16 rounded-full bg-[#434c81]/[0.18]" />
						<span className="h-8 w-8 rounded-md bg-[#434c81]/[0.10]" />
					</div>
					<div className="space-y-2">
						<span className="block h-3 w-24 rounded-full bg-foreground/15" />
						<span className="block h-3 w-32 rounded-full bg-foreground/[0.08]" />
						<span className="block h-3 w-20 rounded-full bg-[#434c81]/[0.12]" />
					</div>
				</div>
			</div>
		</div>
	)
}

const featureDefinitions = [
	{
		icon: Compass,
		titleKey: "detail.selfMedia.initPanel.welcome.feature1.title",
		titleFallback: "定位航向",
		descKey: "detail.selfMedia.initPanel.welcome.feature1.desc",
		descFallback: "AI 深度理解你的 IP 定位，匹配适合的语调与受众",
	},
	{
		icon: Lightbulb,
		titleKey: "detail.selfMedia.initPanel.welcome.feature2.title",
		titleFallback: "智能选题",
		descKey: "detail.selfMedia.initPanel.welcome.feature2.desc",
		descFallback: "一键激发爆款大纲、热点选题，告别灵感枯竭",
	},
	{
		icon: LayoutGrid,
		titleKey: "detail.selfMedia.initPanel.welcome.feature3.title",
		titleFallback: "矩阵生成",
		descKey: "detail.selfMedia.initPanel.welcome.feature3.desc",
		descFallback: "批量卡片式大纲定制，多话题交由 AI 创作助手自动产出",
	},
]
