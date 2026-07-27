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
		| "wechat_official_account"
		| "redirect"
		| "apple_login"
		| "google_login"
		| "anta_login"
		| "private_deployment"
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
		deploymentCode?: string
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
		target?: HTMLElement
	}

	export type CommandErrorCode =
		| "NOT_MOUNTED"
		| "INVALID_INPUT"
		| "IFRAME_NOT_READY"
		| "COMMAND_FAILED"
		| "DESTROYED"

	export interface CommandError extends Error {
		code: CommandErrorCode
	}

	export type EventName = "agent_ready"
	export type EventListener = () => void

	export interface Controller {
		mount(options: MountOptions): void
		open(): void
		close(): void
		destroy(): void
		on(event: EventName, listener: EventListener): () => void
		setInput(content: string): Promise<void>
		appendInput(content: string): Promise<void>
		clearInput(): Promise<void>
		getInput(): Promise<string>
		sendMessage(content: string): Promise<void>
		newConversation(): Promise<void>
	}

	export interface Global extends Controller {
		version: string
	}
}
