/**
 * Prevents React components from rendering themselves directly, which would
 * recurse forever at runtime. Wrapper calls such as observer(() => <Component />)
 * are tracked because overlay components commonly use HOCs.
 */
module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Prevent React components from calling themselves directly, which causes infinite loops",
			category: "Possible Errors",
			recommended: true,
		},
		messages: {
			selfReference:
				'Component "{{name}}" is calling itself directly. This will cause an infinite loop. Did you mean to call a different component?',
		},
		schema: [],
	},

	create(context) {
		const componentStack = []

		function isReactComponent(node) {
			if (node.id && node.id.name) return /^[A-Z]/.test(node.id.name)
			return false
		}

		function isFunctionLike(node) {
			if (!node) return false
			return node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression"
		}

		function hasFunctionArgument(node) {
			if (!node || node.type !== "CallExpression") return false

			return node.arguments.some((argument) => {
				if (!argument) return false
				if (isFunctionLike(argument)) return true
				if (argument.type === "CallExpression") return hasFunctionArgument(argument)
				return false
			})
		}

		function getComponentName(node) {
			if (node.type === "VariableDeclarator" && node.id && node.id.type === "Identifier") {
				return node.id.name
			}
			if (node.type === "FunctionDeclaration" && node.id) {
				return node.id.name
			}
			return null
		}

		function getTrackedComponentName(node) {
			const componentName = getComponentName(node)
			if (!componentName || !/^[A-Z]/.test(componentName)) return null
			if (!node.init) return null
			if (isFunctionLike(node.init)) return componentName
			if (node.init.type === "CallExpression" && hasFunctionArgument(node.init)) {
				return componentName
			}
			return null
		}

		return {
			VariableDeclarator(node) {
				const componentName = getTrackedComponentName(node)
				if (componentName) componentStack.push(componentName)
			},

			FunctionDeclaration(node) {
				if (isReactComponent(node)) {
					componentStack.push(node.id.name)
				}
			},

			JSXElement(node) {
				const openingElement = node.openingElement

				if (openingElement.name && openingElement.name.type === "JSXIdentifier") {
					const elementName = openingElement.name.name
					const currentComponent = componentStack[componentStack.length - 1]

					if (currentComponent && elementName === currentComponent) {
						context.report({
							node: openingElement,
							messageId: "selfReference",
							data: {
								name: elementName,
							},
						})
					}
				}
			},

			"VariableDeclarator:exit"(node) {
				const componentName = getTrackedComponentName(node)
				if (componentName && componentStack[componentStack.length - 1] === componentName) {
					componentStack.pop()
				}
			},

			"FunctionDeclaration:exit"(node) {
				if (
					isReactComponent(node) &&
					componentStack[componentStack.length - 1] === node.id.name
				) {
					componentStack.pop()
				}
			},
		}
	},
}
