import { useTranslation } from "react-i18next"
import { Sparkles, Compass, TrendingUp, HelpCircle } from "lucide-react"

export function WelcomeHero() {
	const { t } = useTranslation("super")

	const features = [
		{
			icon: <Compass className="text-primary" size={16} />,
			title: t("detail.selfMedia.initPanel.welcome.feature1.title", "定位航向"),
			desc: t(
				"detail.selfMedia.initPanel.welcome.feature1.desc",
				"AI 深度理解你的 IP 定位，匹配适合的语调与受众",
			),
		},
		{
			icon: <TrendingUp className="text-primary" size={16} />,
			title: t("detail.selfMedia.initPanel.welcome.feature2.title", "智能选题"),
			desc: t(
				"detail.selfMedia.initPanel.welcome.feature2.desc",
				"一键激发爆款大纲、热点选题，告别灵感枯竭",
			),
		},
		{
			icon: <Sparkles className="text-primary" size={16} />,
			title: t("detail.selfMedia.initPanel.welcome.feature3.title", "矩阵生成"),
			desc: t(
				"detail.selfMedia.initPanel.welcome.feature3.desc",
				"批量卡片式大纲定制，多话题交由 AI 操盘手自动产出",
			),
		},
	]

	return (
		<div className="flex flex-col gap-6 rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] via-primary/[0.01] to-background p-6 lg:p-8">
			{/* Brand Welcome Slogan */}
			<div className="space-y-3">
				<div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
					<Sparkles size={12} className="animate-pulse" />
					<span>{t("detail.selfMedia.initPanel.welcome.tag", "AI 智能操盘手")}</span>
				</div>
				<h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
					{t("detail.selfMedia.initPanel.welcome.title", "开启你的自媒体矩阵创作")}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t(
						"detail.selfMedia.initPanel.welcome.subtitle",
						"超级麦吉自媒体助手能为你配置独立的 AI 操盘手，从定位、选题到成文，打造一站式爆款孵化舱。",
					)}
				</p>
			</div>

			<div className="h-px bg-border/40" />

			{/* Feature Guidance Cards */}
			<div className="space-y-4">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{t("detail.selfMedia.initPanel.welcome.stepsTitle", "创作旅程")}
				</h2>
				<div className="grid gap-3">
					{features.map((item, idx) => (
						<div
							key={idx}
							className="flex gap-3.5 rounded-xl border border-border/50 bg-background/50 p-4 shadow-sm transition-all hover:border-primary/20 hover:bg-background/80"
						>
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/5 shadow-inner ring-1 ring-primary/10">
								{item.icon}
							</div>
							<div className="space-y-1">
								<h3 className="text-sm font-semibold text-foreground">
									{item.title}
								</h3>
								<p className="text-xs leading-relaxed text-muted-foreground">
									{item.desc}
								</p>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Tip Box */}
			<div className="rounded-xl bg-muted/30 p-3.5 ring-1 ring-border/25">
				<div className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
					<HelpCircle size={14} className="shrink-0 text-muted-foreground/70" />
					<p>
						{t(
							"detail.selfMedia.initPanel.welcome.tips",
							"提示：第一步填写的品牌信息，不仅用于本次选题，更将沉淀为你的专属内容风格，让 AI 的下一次创作更懂你。",
						)}
					</p>
				</div>
			</div>
		</div>
	)
}
