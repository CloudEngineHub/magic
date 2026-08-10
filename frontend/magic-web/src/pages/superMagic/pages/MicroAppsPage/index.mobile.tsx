import { useCallback, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { LayoutGrid } from "lucide-react"
import { useTranslation } from "react-i18next"
import { MobileShellSidebarToggleButton } from "@/pages/superMagicMobile/components/MobileShell"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import MicroAppCreatePrompt from "./components/MicroAppCreatePrompt"
import MicroAppHeroTitle from "./components/MicroAppHeroTitle"
import { useMicroAppWorkspace } from "./hooks/useMicroAppsPage"

export default function MicroAppsPageMobile() {
	const { t } = useTranslation("super")
	const navigate = useNavigate()
	const workspace = useMicroAppWorkspace()
	const [promptFocused, setPromptFocused] = useState(false)
	const reduceMotion = Boolean(useReducedMotion())

	const handleOpenApp = useCallback(
		(appId: string) => {
			navigate({
				name: RouteName.MicroApp,
				params: { appId },
				viewTransition: false,
			})
		},
		[navigate],
	)

	return (
		<div
			className="absolute inset-0 flex h-full min-h-0 w-full flex-col overflow-hidden bg-mobile-background"
			data-testid="micro-apps-page-mobile"
		>
			<header className="mobile-page-header relative z-20 shrink-0">
				<MobileShellSidebarToggleButton />
				<div className="min-w-0 flex-1 px-2 text-center">
					<p className="truncate text-[17px] font-medium leading-6 text-foreground">
						{workspace?.name || t("microAppsPage.title")}
					</p>
				</div>
				<button
					type="button"
					className="mobile-page-header-btn transition-opacity [-webkit-tap-highlight-color:transparent] active:opacity-70"
					onClick={() => navigate({ name: RouteName.MicroAppsList })}
					aria-label={t("microAppsPage.openGallery")}
					data-testid="micro-apps-mobile-open-list"
				>
					<LayoutGrid className="size-[22px] text-foreground" aria-hidden />
				</button>
			</header>

			<section
				className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-8"
				data-testid="micro-apps-mobile-hero"
			>
				<div className="relative z-10 w-full">
					<MicroAppHeroTitle active={promptFocused} mobile />
					<motion.p
						className="mx-auto mt-5 max-w-[350px] text-center text-sm leading-6 text-[#172037]/60 dark:text-white/55"
						initial={reduceMotion ? false : { opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
					>
						{t("microAppsPage.heroDescriptionMobile")}
					</motion.p>
				</div>
			</section>

			<motion.div
				className="relative z-20 shrink-0 bg-mobile-background pt-1"
				initial={reduceMotion ? false : { opacity: 0, y: 14 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.65, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
				data-testid="micro-apps-mobile-create-dock"
			>
				<MicroAppCreatePrompt
					workspace={workspace}
					onCreated={handleOpenApp}
					onFocusChange={setPromptFocused}
					mobile
				/>
			</motion.div>
		</div>
	)
}
