import { useTranslation } from "react-i18next"
import { useIsMobile } from "@/hooks/useIsMobile"
import desktopTutorial from "@/assets/resources/wechat-chat-history/desktop-tutorial.webp"
import mobileTutorial from "@/assets/resources/wechat-chat-history/mobile-tutorial.webp"

export default function PasteGuide() {
	const { t } = useTranslation("super")
	const mobile = useIsMobile()
	const modifier = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
		? "⌘"
		: "Ctrl"
	return (
		<section className="mx-auto max-w-3xl p-5">
			<h3 className="text-sm font-medium">{t("wechatChat.guideTitle")}</h3>
			<p className="mb-4 mt-2 text-xs leading-6 text-muted-foreground">
				{mobile
					? t("wechatChat.mobileGuide")
					: t("wechatChat.desktopGuide", { shortcut: `${modifier} V` })}
			</p>
			<img
				src={mobile ? mobileTutorial : desktopTutorial}
				alt={mobile ? t("wechatChat.mobileGuideAlt") : t("wechatChat.desktopGuideAlt")}
				className="w-full rounded-lg border border-border"
			/>
			<p className="mt-3 text-xs leading-6 text-muted-foreground">
				{t("wechatChat.mediaGuide")}
			</p>
		</section>
	)
}
