const browserCompatibilityRestrictions = [
	{
		selector: "MemberExpression[property.name='toSorted']",
		message:
			"Array.prototype.toSorted() is not supported in Chrome < 110 / Safari < 16. Use [...arr].sort() or .slice().sort() instead.",
	},
	{
		selector: "MemberExpression[property.name='toReversed']",
		message:
			"Array.prototype.toReversed() is not supported in Chrome < 110 / Safari < 16. Use [...arr].reverse() or .slice().reverse() instead.",
	},
	{
		selector: "MemberExpression[property.name='toSpliced']",
		message:
			"Array.prototype.toSpliced() is not supported in Chrome < 110 / Safari < 16. Use .slice() + .splice() instead.",
	},
	{
		selector:
			"MemberExpression[property.name='with'][parent.type='CallExpression'][parent.arguments.length>=2]",
		message:
			"Array.prototype.with() is not supported in Chrome < 110 / Safari < 16. Use arr.slice() and index assignment instead.",
	},
	{
		selector: "MemberExpression[object.name='Object'][property.name='groupBy']",
		message:
			"Object.groupBy() is not supported in Chrome < 117 / Safari < 17.4. Use lodash-es groupBy or a manual reduce instead.",
	},
	{
		selector: "MemberExpression[object.name='Map'][property.name='groupBy']",
		message:
			"Map.groupBy() is not supported in Chrome < 117 / Safari < 17.4. Use a manual reduce instead.",
	},
	{
		selector: "CallExpression[callee.name='structuredClone']",
		message:
			"structuredClone() is not supported in Chrome < 98 / Safari < 15.4. Use JSON.parse(JSON.stringify()) or lodash-es cloneDeep instead.",
	},
]

const projectRuleOverrides = {
	"react/display-name": 0,
	"react/prop-types": 0,
	"tailwindcss/classnames-order": "warn",
	"local/no-component-recursion": "warn",
	"compat/compat": "warn",
	"no-restricted-syntax": ["error", ...browserCompatibilityRestrictions],
}

module.exports = {
	browserCompatibilityRestrictions,
	projectRuleOverrides,
}
