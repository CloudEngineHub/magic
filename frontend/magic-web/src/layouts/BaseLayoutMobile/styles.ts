import { createStyles } from "antd-style"

export const useStyles = createStyles(({ css }) => ({
	root: css`
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		/* 移动端页面底色与上下安全区统一收敛到 mobile-background，避免露出旧灰底。 */
		background-color: rgb(var(--mobile-background-rgb));
	`,
	container: css`
		flex: 1 1 0;
		min-height: 0;
		background-color: rgb(var(--mobile-background-rgb));
	`,
	noGlobalSafeAreaWithoutTabBar: css`
		height: 100%;
	`,
}))
