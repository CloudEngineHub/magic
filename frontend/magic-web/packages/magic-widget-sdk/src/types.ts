type CustomLoginStrategy = string & {
	readonly __magicWidgetLoginStrategyBrand?: never
}

export declare namespace MagicWidget {
	export type LoginStrategy =
		| "phone_captcha"
		| "email"
		| "phone_password"
		| "DingTalk"
		| "DingTalkAvoid"
		| "wecom"
		| "Lark"
		| "redirect"
		| "apple_login"
		| "google_login"
		| "anta_login"
		| CustomLoginStrategy

	export type QueryValue =
		| string
		| number
		| boolean
		| null
		| undefined
		| Array<string | number | boolean | null | undefined>

	export interface AuthOptions {
		loginStrategy?: LoginStrategy
		organizationCode?: string
	}

	export interface IframeOptions {
		allow?: string
		sandbox?: string
		query?: Record<string, QueryValue>
	}

	export interface CrewPageOptions {
		type: "crew"
		crewId: string
	}

	export type PageOptions = CrewPageOptions

	export type ModalSlot =
		| "root"
		| "layer"
		| "mask"
		| "container"
		| "header"
		| "title"
		| "close"
		| "body"
		| "iframe"

	export type ModalClassNames = Partial<Record<ModalSlot, string>>

	export type ModalStyles = Partial<
		Record<ModalSlot, Record<string, string | number | null | undefined>>
	>

	export interface ModalOptions {
		title?: string
		width?: number | string
		height?: number | string
		classNames?: ModalClassNames
		styles?: ModalStyles
	}

	export interface MountOptions {
		page: PageOptions
		auth?: AuthOptions
		iframe?: IframeOptions
		modal?: ModalOptions
	}

	export interface Controller {
		mount(options: MountOptions): void
		open(): void
		close(): void
		destroy(): void
	}

	export interface Global extends Controller {
		version: string
	}
}
