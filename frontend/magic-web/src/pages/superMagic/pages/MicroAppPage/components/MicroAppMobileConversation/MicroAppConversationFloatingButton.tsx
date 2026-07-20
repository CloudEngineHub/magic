import { MessageCircle } from "lucide-react"
import { useTranslation } from "react-i18next"

interface MicroAppConversationFloatingButtonProps {
	onClick: () => void
}

/** 微应用主视图右下角的对话入口，避开预览和文件区域的顶部导航。 */
export default function MicroAppConversationFloatingButton({
	onClick,
}: MicroAppConversationFloatingButtonProps) {
	const { t } = useTranslation("super")

	return (
		<button
			type="button"
			onClick={onClick}
			className="absolute bottom-[calc(18px+var(--safe-area-inset-bottom))] right-4 z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_32px_rgba(0,0,0,0.24)] transition-transform active:scale-95"
			aria-label={t("microAppPage.mobileConversation.open")}
			data-testid="micro-app-mobile-conversation-button"
		>
			<MessageCircle className="size-6" aria-hidden />
		</button>
	)
}
