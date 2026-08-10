import type { PlatformPackage } from "@admin/types/platformPackage"

interface DefaultAgentOption {
	label: string
	value: string
	disabled?: boolean
}

export function getModeDisplayName(mode: PlatformPackage.Mode) {
	return (
		mode.name_i18n?.zh_CN || mode.name_i18n?.default || mode.name_i18n?.en_US || mode.identifier
	)
}

export function buildDefaultAgentOptions(modes: PlatformPackage.Mode[], currentAgentCode?: string) {
	const options: DefaultAgentOption[] = modes
		.filter((mode) => mode.status && mode.is_default !== 1)
		.map((mode) => ({
			label: `${getModeDisplayName(mode)} (${mode.identifier})`,
			value: mode.identifier,
		}))

	const currentModeIsSystemDefault = modes.some(
		(mode) => mode.identifier === currentAgentCode && mode.is_default === 1,
	)

	if (
		currentAgentCode &&
		!currentModeIsSystemDefault &&
		!options.some((option) => option.value === currentAgentCode)
	) {
		options.unshift({
			label: currentAgentCode,
			value: currentAgentCode,
			disabled: true,
		})
	}

	return options
}
