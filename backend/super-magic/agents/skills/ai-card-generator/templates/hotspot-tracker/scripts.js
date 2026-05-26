(function () {
  var charts = [];

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function init(node) { var c = echarts.init(node, null, { renderer: "svg" }); charts.push(c); return c; }

  function renderPie() {
    init(document.getElementById("pieChart")).setOption({
      tooltip: { trigger: "item" },
      series: [{
        type: "pie", radius: ["45%", "75%"], avoidLabelOverlap: true,
        label: { color: css("--text"), fontSize: 11 },
        data: [
          { value: 38, name: "微博", itemStyle: { color: "#f43f5e" } },
          { value: 25, name: "抖音", itemStyle: { color: "#06b6d4" } },
          { value: 18, name: "微信", itemStyle: { color: "#8b5cf6" } },
          { value: 12, name: "小红书", itemStyle: { color: "#f59e0b" } },
          { value: 7, name: "其他", itemStyle: { color: "#94a3b8" } }
        ]
      }]
    });
  }

  function renderRising() {
    init(document.getElementById("risingChart")).setOption({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { top: 8, right: 12, bottom: 8, left: 100, containLabel: true },
      xAxis: { type: "value", axisLabel: { color: css("--sub"), formatter: "{value}%" }, splitLine: { lineStyle: { color: css("--border") } } },
      yAxis: { type: "category", axisLabel: { color: css("--text"), fontSize: 11 }, data: ["AI Agent 开发", "边缘计算", "具身智能", "量子纠错", "合成生物"] },
      series: [{ type: "bar", data: [86, 73, 64, 52, 41], itemStyle: { color: css("--coral"), borderRadius: [0, 8, 8, 0] }, barMaxWidth: 16 }]
    });
  }

  function renderRadar() {
    init(document.getElementById("radarChart")).setOption({
      radar: {
        indicator: [
          { name: "讨论量", max: 100 }, { name: "增长速度", max: 100 },
          { name: "情感极性", max: 100 }, { name: "媒体覆盖", max: 100 },
          { name: "商业关联", max: 100 }, { name: "持续力", max: 100 }
        ],
        shape: "circle",
        axisName: { color: css("--sub"), fontSize: 11 },
        splitArea: { areaStyle: { color: ["rgba(6, 182, 212, .03)", "rgba(6, 182, 212, .06)"] } },
        splitLine: { lineStyle: { color: css("--border") } }
      },
      series: [{
        type: "radar",
        data: [
          { name: "本周", value: [88, 92, 74, 81, 67, 72], lineStyle: { color: css("--coral"), width: 2.5 }, areaStyle: { color: "rgba(244, 63, 94, .12)" }, itemStyle: { color: css("--coral") } },
          { name: "上周", value: [72, 68, 71, 75, 62, 65], lineStyle: { color: css("--mint"), width: 2, type: "dashed" }, areaStyle: { color: "rgba(6, 182, 212, .08)" }, itemStyle: { color: css("--mint") } }
        ]
      }]
    });
  }

  function renderSparks() {
    document.querySelectorAll(".spark").forEach(function (node) {
      var d = (node.dataset.series || "").split(",").map(function (v) { return Number(v.trim()); });
      init(node).setOption({
        animation: false,
        grid: { left: 2, right: 2, top: 2, bottom: 2 },
        xAxis: { type: "category", show: false, data: d.map(function (_, i) { return i + 1; }) },
        yAxis: { type: "value", show: false },
        series: [{ type: "line", smooth: true, symbol: "none", data: d, lineStyle: { width: 2.2, color: css("--coral") }, areaStyle: { color: "rgba(244, 63, 94, .1)" } }]
      });
    });
  }

  function gatherContext() {
    return Array.from(document.querySelectorAll(".analysis-source")).slice(0, 10).map(function (n) {
      return n.innerText.replace(/\s+/g, " ").trim();
    }).filter(Boolean).join("\n- ");
  }

  function sendToAgent(prompt) {
    var status = document.getElementById("insightStatus");
    var full = prompt + "\n\n卡片上下文摘要：\n- " + gatherContext();
    var agentId = document.getElementById("agentSelect").value;
    var model = document.getElementById("modelSelect").value || "auto";

    if (!window.Magic) {
      status.textContent = "当前环境未提供 Magic API。";
      return;
    }

    if (window.Magic.project && typeof window.Magic.project.createTopicAndSend === "function") {
      var opts = { model: model };
      if (agentId) opts.agentId = agentId;

      status.textContent = "正在创建话题…";
      window.Magic.project.createTopicAndSend(full, opts).then(function () {
        status.textContent = "已创建新话题并发送 ✓";
      }).catch(function (err) {
        status.textContent = "发送失败：" + (err.message || err);
      });
      return;
    }

    if (typeof window.Magic.setInputMessage === "function") {
      window.Magic.setInputMessage(full);
      status.textContent = "已发送到当前话题（降级模式）";
      return;
    }

    status.textContent = "当前环境不支持消息发送。";
  }

  function loadSelectors() {
    var agentSel = document.getElementById("agentSelect");
    var modelSel = document.getElementById("modelSelect");

    if (window.Magic && window.Magic.agent && typeof window.Magic.agent.getAgents === "function") {
      window.Magic.agent.getAgents().then(function (agents) {
        agentSel.innerHTML = "";
        agents.forEach(function (a) {
          var opt = document.createElement("option");
          opt.value = a.id;
          opt.textContent = a.name;
          agentSel.appendChild(opt);
        });
        var target = agents.find(function (a) { return a.id.indexOf("ip-manager") !== -1 || a.id.indexOf("ip_manager") !== -1; });
        if (target) agentSel.value = target.id;
      }).catch(function () {
        agentSel.innerHTML = "<option value=''>无法加载</option>";
      });
    } else {
      agentSel.innerHTML = "<option value=''>不可用</option>";
    }

    if (window.Magic && window.Magic.llm && typeof window.Magic.llm.getModels === "function") {
      window.Magic.llm.getModels().then(function (models) {
        modelSel.innerHTML = "<option value=\"auto\">自动选择（推荐）</option>";
        models.forEach(function (m) {
          var opt = document.createElement("option");
          opt.value = m.id;
          opt.textContent = m.id;
          modelSel.appendChild(opt);
        });
      }).catch(function () {});
    }
  }

  function setupInsight() {
    document.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () { sendToAgent(chip.dataset.prompt); });
    });
    var input = document.getElementById("askInput");
    document.getElementById("askSend").addEventListener("click", function () {
      var q = input.value.trim();
      if (q) { sendToAgent(q); input.value = ""; }
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); document.getElementById("askSend").click(); }
    });
    loadSelectors();
  }

  function rebuild() {
    charts.forEach(function (c) { c.dispose(); });
    charts = [];
    renderPie();
    renderRising();
    renderRadar();
    renderSparks();
  }

  setupInsight();
  rebuild();
  window.addEventListener("resize", function () { charts.forEach(function (c) { c.resize(); }); });
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", rebuild);
})();
