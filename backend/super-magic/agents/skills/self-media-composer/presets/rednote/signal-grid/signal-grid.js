/**
 * signal-grid.js
 * ECharts helpers for the Signal Grid preset.
 *
 * Exposes: window.SignalGridPresets
 */
(function (global) {
  "use strict";

  var T = {
    paper: "#fbfbfa",
    ink: "#111111",
    grey1: "#ededeb",
    grey2: "#d7d8d5",
    grey3: "#6f726e",
    accent: "#1f5fe8",
    positive: "#83956d",
    negative: "#c47a68",
    font: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
  };

  var presets = {};

  function add(name, fn) {
    presets[name] = fn;
  }

  function get(name, params) {
    if (!presets[name]) {
      console.warn("[SignalGridPresets] unknown preset:", name);
      return {};
    }
    return presets[name](params || {});
  }

  add("grid-bars", function (p) {
    return {
      backgroundColor: "transparent",
      grid: { top: 8, right: 10, bottom: 18, left: 52, containLabel: true },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: T.grey2 } },
        axisLabel: { color: T.grey3, fontFamily: T.font, fontSize: 10 },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: p.labels || ["Sleep", "Phone", "Task", "Desk"],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: T.ink, fontFamily: T.font, fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          barWidth: 16,
          data: p.values || [74, 62, 48, 36],
          itemStyle: { color: T.accent },
          label: {
            show: true,
            position: "right",
            color: T.ink,
            fontFamily: T.font,
            fontSize: 11,
          },
        },
      ],
    };
  });

  add("grid-line", function (p) {
    return {
      backgroundColor: "transparent",
      grid: { top: 22, right: 10, bottom: 20, left: 6, containLabel: true },
      xAxis: {
        type: "category",
        data: p.xData || ["01", "02", "03", "04", "05"],
        axisLine: { lineStyle: { color: T.ink } },
        axisTick: { show: false },
        axisLabel: { color: T.grey3, fontFamily: T.font, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: T.grey2 } },
        axisLabel: { color: T.grey3, fontFamily: T.font, fontSize: 10 },
      },
      series: [
        {
          type: "line",
          data: p.yData || [18, 28, 24, 38, 52],
          symbol: "rect",
          symbolSize: 7,
          lineStyle: { color: T.accent, width: 2 },
          itemStyle: { color: T.accent },
        },
      ],
    };
  });

  add("grid-donut", function (p) {
    return {
      backgroundColor: "transparent",
      series: [
        {
          type: "pie",
          radius: ["48%", "72%"],
          center: ["50%", "50%"],
          label: { show: false },
          data: p.data || [
            { name: "Focus", value: 46, itemStyle: { color: T.accent } },
            { name: "Rest", value: 32, itemStyle: { color: T.ink } },
            { name: "Noise", value: 22, itemStyle: { color: T.grey2 } },
          ],
        },
      ],
    };
  });

  add("decision-radar", function (p) {
    return {
      backgroundColor: "transparent",
      radar: {
        radius: "64%",
        center: ["50%", "52%"],
        axisName: { color: T.grey3, fontFamily: T.font, fontSize: 10 },
        axisLine: { lineStyle: { color: T.grey2 } },
        splitLine: { lineStyle: { color: T.grey2 } },
        splitArea: { show: false },
        indicator: p.indicator || [
          { name: "Sleep", max: 100 },
          { name: "Phone", max: 100 },
          { name: "Task", max: 100 },
          { name: "Desk", max: 100 },
          { name: "Noise", max: 100 },
        ],
      },
      series: [
        {
          type: "radar",
          symbol: "rect",
          symbolSize: 6,
          data: [
            {
              value: p.values || [82, 76, 68, 42, 74],
              lineStyle: { color: T.accent, width: 2 },
              itemStyle: { color: T.accent },
              areaStyle: { color: "rgba(31,95,232,0.09)" },
            },
          ],
        },
      ],
    };
  });

  add("signal-stack", function (p) {
    return {
      backgroundColor: "transparent",
      grid: { top: 14, right: 12, bottom: 18, left: 10, containLabel: true },
      xAxis: {
        type: "category",
        data: p.labels || ["Sleep", "Phone", "Task", "Desk"],
        axisLine: { lineStyle: { color: T.ink } },
        axisTick: { show: false },
        axisLabel: { color: T.grey3, fontFamily: T.font, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: T.grey2 } },
        axisLabel: { show: false },
      },
      series: [
        {
          type: "bar",
          stack: "signal",
          barWidth: 20,
          data: p.base || [26, 18, 22, 14],
          itemStyle: { color: T.ink },
        },
        {
          type: "bar",
          stack: "signal",
          barWidth: 20,
          data: p.delta || [46, 38, 31, 28],
          itemStyle: { color: T.accent },
        },
      ],
    };
  });

  global.SignalGridPresets = { add: add, get: get };
})(window);
