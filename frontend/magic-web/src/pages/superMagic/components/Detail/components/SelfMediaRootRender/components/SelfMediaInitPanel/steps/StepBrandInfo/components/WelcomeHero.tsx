import { useTranslation } from "react-i18next"
import { Sparkles } from "lucide-react"
import { SketchTitleIllustration } from "../../../components/ui/SketchTitleIllustration"
import { SKETCH_STYLES } from "../../../constants"

export function WelcomeHero() {
	const { t } = useTranslation("super")
	const features = featureDefinitions.map((feature) => ({
		title: t(feature.titleKey, feature.titleFallback),
		desc: t(feature.descKey, feature.descFallback),
	}))

	return (
		<div
			className="relative overflow-hidden bg-white px-1 py-5 lg:px-2"
			data-testid="self-media-welcome-hero"
		>
			<div className={SKETCH_STYLES.heroGrid} />
			<div className="relative z-[1] grid items-center gap-8 border-b border-dashed border-zinc-950/10 pb-7 md:grid-cols-[minmax(0,1fr)_280px]">
				<div className="space-y-5">
					<div className="inline-flex items-center gap-1.5 bg-primary/20 px-3 py-1.5 text-xs font-black text-zinc-950">
						<Sparkles size={12} className="animate-pulse text-zinc-950" />
						<span>{t("detail.selfMedia.initPanel.welcome.tag", "AI 创作助手")}</span>
					</div>
					<div className="max-w-2xl space-y-3">
						<h1 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
							{t(
								"detail.selfMedia.initPanel.welcome.title",
								"开启你的自媒体矩阵创作",
							)}
						</h1>
						<p className="text-sm font-bold leading-relaxed text-muted-foreground">
							{t(
								"detail.selfMedia.initPanel.welcome.subtitle",
								"超级麦吉自媒体助手帮你配置专属 AI 创作助手，从定位、选题到成文，打造一站式爆款内容工坊。",
							)}
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-3">
						{features.map((item, idx) => (
							<div key={idx} className="border-l-2 border-primary/40 py-1 pl-3">
								<div className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-primary">
									Step 0{idx + 1}
								</div>
								<h3 className="text-sm font-black text-zinc-950">{item.title}</h3>
								<p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-muted-foreground">
									{item.desc}
								</p>
							</div>
						))}
					</div>
				</div>
				<SketchTitleIllustration
					variant="outline"
					className="mx-auto hidden h-[210px] w-full max-w-[280px] md:block"
					data-testid="self-media-welcome-illustration"
				/>
			</div>
		</div>
	)
}

const featureDefinitions = [
	{
		titleKey: "detail.selfMedia.initPanel.welcome.feature1.title",
		titleFallback: "定位航向",
		descKey: "detail.selfMedia.initPanel.welcome.feature1.desc",
		descFallback: "AI 深度理解你的 IP 定位，匹配适合的语调与受众",
	},
	{
		titleKey: "detail.selfMedia.initPanel.welcome.feature2.title",
		titleFallback: "智能选题",
		descKey: "detail.selfMedia.initPanel.welcome.feature2.desc",
		descFallback: "一键激发爆款大纲、热点选题，告别灵感枯竭",
	},
	{
		titleKey: "detail.selfMedia.initPanel.welcome.feature3.title",
		titleFallback: "矩阵生成",
		descKey: "detail.selfMedia.initPanel.welcome.feature3.desc",
		descFallback: "批量卡片式大纲定制，多话题交由 AI 创作助手自动产出",
	},
]
