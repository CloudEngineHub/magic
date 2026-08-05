interface ModeWithVisibility {
	agent: {
		is_visible?: boolean
	}
}

export function isModeVisibleToCurrentUser(mode: ModeWithVisibility) {
	return mode.agent.is_visible !== false
}

export function partitionModesByVisibility<T extends ModeWithVisibility>(modes: T[]) {
	const visibleModes: T[] = []
	const hiddenModes: T[] = []

	modes.forEach((mode) => {
		if (isModeVisibleToCurrentUser(mode)) {
			visibleModes.push(mode)
		} else {
			hiddenModes.push(mode)
		}
	})

	return { visibleModes, hiddenModes }
}
