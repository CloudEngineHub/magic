/**
 * ins-minimal.js
 * Instagram Minimal ECharts presets.
 * CSS quick reference: .imn-card, .imn-cover, .imn-content, .imn-header, .imn-section-label, .imn-data-card, .imn-list-row, .imn-quote-block, .imn-compare-grid, .imn-note.
 */
(function (global) {
  "use strict";
  var T = {
    accent: "#1E40AF",
    accent2: "#C8A46B",
    text: "#151515",
    muted: "#6D716F",
    border: "#D8D4CA",
    surface: "#FFFFFF",
    surface2: "#EEF2F6",
    positive: "#0F766E",
    negative: "#B91C1C",
  };
  var presets = {};
  function axis() {
    return {
      axisLabel: { color: T.muted, fontSize: 12, fontWeight: 700 },
      axisLine: { lineStyle: { color: T.border } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: T.border, opacity: 0.16 } },
    };
  }
  presets["ins-minimal-bar"] = function (params) {
    var categories = params.categories || ["Hook", "Proof", "Save", "Share"];
    var values = params.values || [82, 68, 91, 57];
    return {
      color: [T.accent, T.accent2],
      grid: { left: 44, right: 18, top: 38, bottom: 42 },
      tooltip: { trigger: "axis" },
      xAxis: Object.assign({ type: "category", data: categories }, axis()),
      yAxis: Object.assign({ type: "value" }, axis()),
      series: [
        {
          type: "bar",
          data: values.map(function (value, index) {
            return {
              value: value,
              itemStyle: { color: index === 2 ? T.accent2 : T.accent },
            };
          }),
          barWidth: 34,
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
  presets["ins-minimal-line"] = function (params) {
    var labels = params.labels || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var values = params.values || [22, 38, 34, 56, 72, 88];
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
  presets["ins-minimal-donut"] = function (params) {
    var data = params.data || [
      { name: "Saves", value: 42 },
      { name: "Shares", value: 24 },
      { name: "Comments", value: 18 },
      { name: "Follows", value: 16 },
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
          avoidLabelOverlap: true,
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
      console.warn("[InsMinimalPresets] preset not found:", key);
      return {};
    }
    return presets[key](params || {});
  }
  var api = { get: get, add: add, tokens: T };
  global.InsMinimalPresets = api;
  global.INSPresets = api;
})(window);
