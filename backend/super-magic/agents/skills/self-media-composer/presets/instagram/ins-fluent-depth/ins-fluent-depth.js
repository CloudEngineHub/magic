/**
 * ins-fluent-depth.js
 * Instagram Fluent Depth ECharts presets.
 */
(function (global) {
  "use strict";
  var T = {
    accent: "#2563eb",
    accent2: "#7c3aed",
    text: "#111827",
    muted: "#667085",
    border: "rgba(17, 24, 39, 0.12)",
    surface: "#ffffff",
    surface2: "#eef3fb",
    positive: "#107c41",
    negative: "#c4314b",
  };
  var presets = {};
  function axis() {
    return {
      axisLabel: { color: T.muted, fontSize: 12, fontWeight: 700 },
      axisLine: { lineStyle: { color: T.border } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: T.border, opacity: 0.55 } },
    };
  }
  presets["ins-fluent-depth-bar"] = function (params) {
    var categories = params.categories || [
      "Clarity",
      "Flow",
      "Trust",
      "Action",
    ];
    var values = params.values || [86, 74, 92, 68];
    return {
      color: [T.accent, T.accent2],
      grid: { left: 44, right: 18, top: 38, bottom: 42 },
      tooltip: { trigger: "axis" },
      xAxis: Object.assign({ type: "category", data: categories }, axis()),
      yAxis: Object.assign({ type: "value" }, axis()),
      series: [
        {
          type: "bar",
          barWidth: 34,
          data: values.map(function (value, index) {
            return {
              value: value,
              itemStyle: { color: index === 2 ? T.accent2 : T.accent },
            };
          }),
          label: {
            show: true,
            position: "top",
            color: T.text,
            fontWeight: 800,
          },
        },
      ],
    };
  };
  presets["ins-fluent-depth-line"] = function (params) {
    var labels = params.labels || [
      "Discover",
      "Compare",
      "Decide",
      "Share",
      "Save",
    ];
    var values = params.values || [30, 46, 62, 78, 88];
    return {
      color: [T.accent],
      grid: { left: 42, right: 18, top: 34, bottom: 42 },
      tooltip: { trigger: "axis" },
      xAxis: Object.assign(
        { type: "category", data: labels, boundaryGap: false },
        axis(),
      ),
      yAxis: Object.assign({ type: "value" }, axis()),
      series: [
        {
          type: "line",
          smooth: true,
          symbolSize: 10,
          data: values,
          lineStyle: { width: 5, color: T.accent },
          areaStyle: { color: T.accent, opacity: 0.14 },
        },
      ],
    };
  };
  presets["ins-fluent-depth-donut"] = function (params) {
    var data = params.data || [
      { name: "Useful", value: 44 },
      { name: "Clear", value: 28 },
      { name: "Credible", value: 18 },
      { name: "Shareable", value: 10 },
    ];
    return {
      color: [T.accent, T.accent2, T.positive, T.surface2],
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: T.muted, fontWeight: 700 } },
      series: [
        {
          type: "pie",
          radius: ["48%", "72%"],
          center: ["50%", "44%"],
          data: data,
          label: { color: T.text, fontWeight: 800 },
          itemStyle: { borderColor: T.surface, borderWidth: 4 },
        },
      ],
    };
  };
  function add(key, fn) {
    presets[key] = fn;
  }
  function get(key, params) {
    if (!presets[key]) {
      console.warn("[InsFluentDepthPresets] preset not found:", key);
      return {};
    }
    return presets[key](params || {});
  }
  var api = { get: get, add: add, tokens: T };
  global.InsFluentDepthPresets = api;
  global.INSPresets = api;
})(window);
