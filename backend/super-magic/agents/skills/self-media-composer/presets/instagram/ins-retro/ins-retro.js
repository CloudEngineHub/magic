/**
 * ins-retro.js
 * Instagram Retro Story ECharts presets.
 * CSS quick reference: .irt-card, .irt-cover, .irt-content, .irt-header, .irt-section-label, .irt-data-card, .irt-list-row, .irt-quote-block, .irt-compare-grid, .irt-note.
 */
(function (global) {
  "use strict";
  var T = {
    accent: "#B8322A",
    accent2: "#275D5B",
    text: "#2A211A",
    muted: "#76624F",
    border: "#6C4932",
    surface: "#FFF7E6",
    surface2: "#EAD2A7",
    positive: "#2F7D52",
    negative: "#B8322A",
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
  presets["ins-retro-bar"] = function (params) {
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
  presets["ins-retro-line"] = function (params) {
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
  presets["ins-retro-donut"] = function (params) {
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
      console.warn("[InsRetroPresets] preset not found:", key);
      return {};
    }
    return presets[key](params || {});
  }
  var api = { get: get, add: add, tokens: T };
  global.InsRetroPresets = api;
  global.INSPresets = api;
})(window);
