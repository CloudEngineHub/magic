import { Loader2 } from "lucide-react"
import UserAvatarRender from "@/components/business/UserAvatarRender"
import { Button } from "@/components/shadcn-ui/button"
import type { User } from "@/types/user"

interface OrganizationSwitchStateProps {
	icon: string
	title: string
	description: string
	userInfo: User.UserInfo | null
	actionLabel: string
	switchingLabel: string
	isSwitching?: boolean
	onSwitch: () => void
	testIdPrefix: string
	switchButtonTestId?: string
}

/** Shared visual state for links that require changing organizations before continuing. */
export default function OrganizationSwitchState({
	icon,
	title,
	description,
	userInfo,
	actionLabel,
	switchingLabel,
	isSwitching = false,
	onSwitch,
	testIdPrefix,
	switchButtonTestId,
}: OrganizationSwitchStateProps) {
	return (
		<div
			className="flex flex-1 items-center justify-center p-5"
			data-testid={`${testIdPrefix}-content`}
		>
			<div className="flex w-full max-w-[400px] flex-col items-center gap-5">
				<img
					src={icon}
					alt=""
					className="h-[60px] w-[60px] shrink-0"
					data-testid={`${testIdPrefix}-icon`}
				/>

				<div
					className="text-center text-lg font-semibold leading-6 text-foreground/80"
					data-testid={`${testIdPrefix}-title`}
				>
					{title}
				</div>

				<div
					className="flex flex-col gap-5 self-stretch rounded-xl border border-[#1C1D23]/[0.08] bg-white p-5"
					data-testid={`${testIdPrefix}-card`}
				>
					<div className="flex flex-col items-center gap-2 self-stretch">
						<div
							className="self-stretch text-center text-xs font-normal leading-4 text-foreground/60"
							data-testid={`${testIdPrefix}-tip`}
						>
							{description}
						</div>

						<div
							className="flex items-center gap-1"
							data-testid={`${testIdPrefix}-user`}
						>
							<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#DDE7FF] p-[1.5px]">
								<UserAvatarRender
									userInfo={userInfo}
									size={24}
									className="h-6 w-6 rounded-md"
								/>
							</div>
							<span className="text-sm font-semibold leading-5 text-foreground">
								{userInfo?.nickname || ""}
							</span>
						</div>
					</div>

					<Button
						type="button"
						onClick={onSwitch}
						disabled={isSwitching}
						className="h-auto self-stretch rounded-lg border-0 px-6 py-1.5 text-sm font-normal leading-5"
						data-testid={switchButtonTestId || `${testIdPrefix}-switch-button`}
					>
						{isSwitching ? <Loader2 size={16} className="animate-spin" /> : null}
						{isSwitching ? switchingLabel : actionLabel}
					</Button>
				</div>
			</div>
		</div>
	)
}
