import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"

interface MicroAppHeroTitleProps {
	active?: boolean
	mobile?: boolean
}

export default function MicroAppHeroTitle({
	active = false,
	mobile = false,
}: MicroAppHeroTitleProps) {
	const { t } = useTranslation("super")
	const reduceMotion = Boolean(useReducedMotion())
	const capabilityLabels = [
		t("microAppsPage.heroCapabilityAgent"),
		t("microAppsPage.heroCapabilitySkill"),
		t("microAppsPage.heroCapabilityData"),
		t("microAppsPage.heroCapabilityMcp"),
	]

	return (
		<div
			className={mobile ? "mx-auto max-w-[390px]" : "mx-auto max-w-[1080px]"}
			data-testid="micro-app-hero-title"
			data-active={active}
		>
			<motion.div
				className={`flex flex-wrap items-center justify-center font-mono font-semibold uppercase text-[#172037]/45 dark:text-white/40 ${
					mobile
						? "mb-3 gap-x-2 gap-y-1 text-[8px] tracking-[0.12em]"
						: "mb-4 gap-x-3 text-[10px] tracking-[0.18em]"
				}`}
				initial={reduceMotion ? false : { opacity: 0, x: -12 }}
				animate={{ opacity: 1, x: 0 }}
				transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
				aria-hidden
			>
				{capabilityLabels.map((label, index) => (
					<span key={label} className="flex items-center gap-2">
						<motion.span
							className={
								active
									? "text-[#6254d9] dark:text-[#a99fff]"
									: "text-[#172037]/45 dark:text-white/40"
							}
							animate={reduceMotion ? undefined : { y: active ? -2 : 0 }}
							transition={{ duration: 0.35, delay: index * 0.04 }}
						>
							{label}
						</motion.span>
						<span className="text-[#172037]/20 dark:text-white/20">
							{index === capabilityLabels.length - 1 ? "→" : "/"}
						</span>
					</span>
				))}
				<motion.span
					className="text-[#172037] dark:text-white"
					animate={reduceMotion ? undefined : { x: active ? 4 : 0 }}
					transition={{ duration: 0.35 }}
				>
					{t("microAppsPage.heroCapabilityProduct")}
				</motion.span>
			</motion.div>

			<motion.h1
				className={`text-center font-semibold text-[#172037] dark:text-zinc-50 ${
					mobile
						? "text-[36px] leading-[1.04] tracking-[-0.05em]"
						: "text-[54px] leading-[1] tracking-[-0.055em] xl:text-[64px]"
				}`}
				aria-label={t("microAppsPage.heroTitle")}
				initial={reduceMotion ? false : { opacity: 0, y: 24 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
			>
				<span>{t("microAppsPage.heroTitlePrefix")}</span>
				<span>{t("microAppsPage.heroTitleBetween")}</span>
				<span className="relative isolate mx-[0.12em] inline-flex font-serif font-medium italic tracking-[-0.04em]">
					{/* 不规则路径只用于强调最终交付物，避免回到下方能力卡片的视觉表达。 */}
					<motion.svg
						viewBox="0 0 330 104"
						preserveAspectRatio="none"
						className="absolute -inset-x-[0.15em] -inset-y-[0.1em] -z-10 overflow-visible"
						aria-hidden
						animate={
							reduceMotion
								? undefined
								: { rotate: active ? -0.5 : -1.8, scale: active ? 1.035 : 1 }
						}
						transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
					>
						<motion.path
							d="M18 55C27 16 112 5 194 13C282 21 326 42 312 68C295 96 205 99 119 91C39 83 4 74 18 55Z"
							fill="rgba(123,232,174,0.14)"
							stroke="#7BE8AE"
							strokeWidth="5"
							strokeLinecap="round"
							initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
							animate={{ pathLength: 1, opacity: active ? 1 : 0.78 }}
							transition={{ duration: reduceMotion ? 0 : 0.9, delay: 0.38 }}
						/>
					</motion.svg>
					<span>{t("microAppsPage.heroTitleProduct")}</span>
				</span>
			</motion.h1>
		</div>
	)
}
