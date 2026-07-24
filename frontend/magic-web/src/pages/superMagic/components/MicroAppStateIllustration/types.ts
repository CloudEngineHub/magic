export type MicroAppStateIllustrationType =
	| "empty"
	| "building"
	| "confirm"
	| "search-empty"
	| "retry"
	| "permission"
	| "published"
	| "database-empty"

export interface MicroAppStateSceneProps {
	accent: string
	surface: string
	animated: boolean
}
