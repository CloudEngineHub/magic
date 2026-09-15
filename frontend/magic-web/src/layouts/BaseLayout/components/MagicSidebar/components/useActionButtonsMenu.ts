import { CircleQuestionMark, type LucideIcon, Trash2 } from "lucide-react"
import { useMemo } from "react"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import { isInternationalEnv, isPrivateDeployment } from "@/utils/env"
type ActionButtonItem = {
	id: string
	label: string
	icon: LucideIcon
	onClick: () => void
}

export function useActionButtonsMenu(): ActionButtonItem[] {
	const navigate = useNavigate()
	const isPrivateDeploymentEnv = isPrivateDeployment()
	const isInternationalEnvironment = isInternationalEnv()
	return useMemo<ActionButtonItem[]>(
		() => [
			{
				id: "recycle-bin",
				icon: Trash2,
				label: "footer.recycleBin",
				onClick: () => navigate({ name: RouteName.RecycleBin }),
			},
			...(!isPrivateDeploymentEnv && !isInternationalEnvironment
				? [
						{
							id: "help-center",
							icon: CircleQuestionMark,
							label: "footer.helpCenter",
							onClick: () => window.open("/help", "_blank", "noopener,noreferrer"),
						},
					]
				: []),
		],
		[navigate, isInternationalEnvironment, isPrivateDeploymentEnv],
	)
}
