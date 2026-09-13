export type PhoneShellProfile =
	"modern" | "home-button" | "notch" | "punch-hole" | "tablet" | "foldable" | "flip"

export interface PhoneShellInsets {
	left: number
	right: number
	top: number
	bottom: number
}

/** 仅表示外观装饰占位，不是设备的系统 safe-area 或物理屏幕参数。 */
export function getPhoneShellInsets(
	profile: PhoneShellProfile,
	landscape: boolean,
	posture?: "folded" | "unfolded",
): PhoneShellInsets {
	if (profile === "foldable" || profile === "flip")
		return posture === "unfolded"
			? { left: 12, right: 12, top: 36, bottom: 24 }
			: { left: 10, right: 10, top: 44, bottom: 26 }
	if (profile === "tablet") return { left: 20, right: 20, top: 46, bottom: 34 }
	if (landscape)
		return profile === "home-button"
			? { left: 64, right: 74, top: 10, bottom: 10 }
			: { left: 38, right: 9, top: 9, bottom: 24 }
	if (profile === "home-button") return { left: 10, right: 10, top: 64, bottom: 74 }
	if (profile === "punch-hole") return { left: 9, right: 9, top: 48, bottom: 25 }
	return { left: 9, right: 9, top: 54, bottom: 28 }
}

export const NO_PHONE_SHELL_INSETS: PhoneShellInsets = { left: 0, right: 0, top: 0, bottom: 0 }
