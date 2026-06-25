/**
 * paper-column.js
 * ECharts helpers for the Paper Column preset.
 *
 * Exposes: window.PaperColumnPresets
 */
(function (global) {
  "use strict";

  var T = {
    paper: "#f5f1ea",
    paperSoft: "#e8dfd2",
    ink: "#2b2925",
    muted: "#746d63",
    line: "rgba(92,82,68,0.2)",
    accent: "#567493",
    accentSoft: "#dbe7f0",
    positive: "#7d8f68",
    negative: "#b8756a",
    fontDisplay: "'Noto Serif SC', 'Songti SC', serif",
    fontBody:
      "'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
  };

  var presets = {};

  function add(name, fn) {
    presets[name] = fn;
  }

  function get(name, params) {
    if (!presets[name]) {
      console.warn("[PaperColumnPresets] unknown preset:", name);
      return {};
    }
    return presets[name](params || {});
  }

  add("essay-line", function (p) {
    return {
      backgroundColor: "transparent",
      grid: { top: 28, right: 8, bottom: 24, left: 10, containLabel: true },
      xAxis: {
        type: "category",
        data: p.xData || ["Mon", "Tue", "Wed", "Thu", "Fri"],
        axisTick: { show: false },
        axisLine: { lineStyle: { color: T.line } },
        axisLabel: { color: T.muted, fontFamily: T.fontBody, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: T.line } },
        axisLabel: { color: T.muted, fontFamily: T.fontBody, fontSize: 10 },
      },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          data: p.yData || [12, 18, 15, 24, 31],
          lineStyle: { color: T.accent, width: 2 },
          itemStyle: { color: T.accent },
          areaStyle: { color: "rgba(86,116,147,0.13)" },
        },
      ],
    };
  });

  add("ledger-bar", function (p) {
    var values = p.values || [42, 64, 51, 78];
    return {
      backgroundColor: "transparent",
      grid: { top: 16, right: 12, bottom: 20, left: 70 },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: p.labels || ["Path", "Bench", "Plant", "Quiet"],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: T.muted, fontFamily: T.fontBody, fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          barWidth: 12,
          data: values,
          itemStyle: { color: T.accent, borderRadius: [0, 2, 2, 0] },
          label: {
            show: true,
            position: "right",
            color: T.ink,
            fontFamily: T.fontBody,
            fontSize: 11,
          },
        },
      ],
    };
  });

  add("evidence-donut", function (p) {
    return {
      backgroundColor: "transparent",
      series: [
        {
          type: "pie",
          radius: ["52%", "70%"],
          center: ["50%", "52%"],
          avoidLabelOverlap: true,
          label: {
            color: T.ink,
            fontFamily: T.fontBody,
            fontSize: 11,
          },
          labelLine: { lineStyle: { color: T.line } },
          data: p.data || [
            { name: "Path", value: 38, itemStyle: { color: T.accent } },
            { name: "Bench", value: 34, itemStyle: { color: T.positive } },
            { name: "Plant", value: 28, itemStyle: { color: T.accentSoft } },
          ],
        },
      ],
    };
  });

  add("note-radar", function (p) {
    return {
      backgroundColor: "transparent",
      radar: {
        radius: "62%",
        center: ["50%", "52%"],
        splitNumber: 4,
        axisName: { color: T.muted, fontFamily: T.fontBody, fontSize: 10 },
        axisLine: { lineStyle: { color: T.line } },
        splitLine: { lineStyle: { color: T.line } },
        splitArea: {
          areaStyle: {
            color: ["rgba(255,255,255,0.2)", "rgba(219,231,240,0.25)"],
          },
        },
        indicator: p.indicator || [
          { name: "Path", max: 100 },
          { name: "Shade", max: 100 },
          { name: "Quiet", max: 100 },
          { name: "Stay", max: 100 },
        ],
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: p.values || [86, 72, 78, 64],
              areaStyle: { color: "rgba(86,116,147,0.16)" },
              lineStyle: { color: T.accent, width: 2 },
              itemStyle: { color: T.accent },
            },
          ],
        },
      ],
    };
  });

  add("evidence-columns", function (p) {
    var values = p.values || [18, 28, 24, 36, 31];
    return {
      backgroundColor: "transparent",
      grid: { top: 18, right: 10, bottom: 22, left: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: p.labels || ["A", "B", "C", "D", "E"],
        axisTick: { show: false },
        axisLine: { lineStyle: { color: T.line } },
        axisLabel: { color: T.muted, fontFamily: T.fontBody, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: T.line } },
        axisLabel: { show: false },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 22,
          data: values.map(function (value, index) {
            return {
              value: value,
              itemStyle: {
                color: index === values.length - 1 ? T.accent : T.accentSoft,
              },
            };
          }),
        },
      ],
    };
  });

  global.PaperColumnPresets = { add: add, get: get };
})(window);
