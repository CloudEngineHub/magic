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
          { value: 38, name: "Weibo", itemStyle: { color: "#f43f5e" } },
          { value: 25, name: "Douyin", itemStyle: { color: "#06b6d4" } },
          { value: 18, name: "WeChat", itemStyle: { color: "#8b5cf6" } },
          { value: 12, name: "Rednote", itemStyle: { color: "#f59e0b" } },
          { value: 7, name: "Other", itemStyle: { color: "#94a3b8" } }
        ]
      }]
    });
  }

  function renderRising() {
    init(document.getElementById("risingChart")).setOption({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { top: 8, right: 12, bottom: 8, left: 100, containLabel: true },
      xAxis: { type: "value", axisLabel: { color: css("--sub"), formatter: "{value}%" }, splitLine: { lineStyle: { color: css("--border") } } },
      yAxis: { type: "category", axisLabel: { color: css("--text"), fontSize: 11 }, data: ["AI agent development", "Edge computing", "Embodied intelligence", "Quantum error correction", "Synthetic biology"] },
      series: [{ type: "bar", data: [86, 73, 64, 52, 41], itemStyle: { color: css("--coral"), borderRadius: [0, 8, 8, 0] }, barMaxWidth: 16 }]
    });
  }

  function renderRadar() {
    init(document.getElementById("radarChart")).setOption({
      radar: {
        indicator: [
          { name: "Discussion volume", max: 100 }, { name: "Growth speed", max: 100 },
          { name: "Sentiment polarity", max: 100 }, { name: "Media coverage", max: 100 },
          { name: "Commercial relevance", max: 100 }, { name: "Staying power", max: 100 }
        ],
        shape: "circle",
        axisName: { color: css("--sub"), fontSize: 11 },
        splitArea: { areaStyle: { color: ["rgba(6, 182, 212, .03)", "rgba(6, 182, 212, .06)"] } },
        splitLine: { lineStyle: { color: css("--border") } }
      },
      series: [{
        type: "radar",
        data: [
          { name: "This week", value: [88, 92, 74, 81, 67, 72], lineStyle: { color: css("--coral"), width: 2.5 }, areaStyle: { color: "rgba(244, 63, 94, .12)" }, itemStyle: { color: css("--coral") } },
          { name: "Last week", value: [72, 68, 71, 75, 62, 65], lineStyle: { color: css("--mint"), width: 2, type: "dashed" }, areaStyle: { color: "rgba(6, 182, 212, .08)" }, itemStyle: { color: css("--mint") } }
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

  function bindSourcePreview() {
    var frame = document.getElementById("sourceFrame");
    var close = document.getElementById("sourceClose");
    var wrap = frame ? frame.closest(".source-frame-wrap") : null;
    if (!frame || !wrap) return;

    document.querySelectorAll(".source-preview").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".source-preview").forEach(function (n) { n.classList.remove("active"); });
        btn.classList.add("active");
        frame.src = btn.dataset.previewUrl;
        wrap.classList.remove("collapsed");
        if (close) close.textContent = "Collapse";
      });
    });

    if (close) {
      close.addEventListener("click", function () {
        var collapsed = wrap.classList.toggle("collapsed");
        close.textContent = collapsed ? "Expand" : "Collapse";
      });
    }

    var initial = document.querySelector(".source-preview.active") || document.querySelector(".source-preview");
    if (initial) frame.src = initial.dataset.previewUrl;
  }

  function sendToAgent(prompt) {
    var status = document.getElementById("insightStatus");
    var full = prompt + "\n\nCard context summary:\n- " + gatherContext();
    var agentId = document.getElementById("agentSelect").value;
    var model = document.getElementById("modelSelect").value || "auto";

    if (!window.Magic) {
      status.textContent = "Magic API is not available in the current environment.";
      return;
    }

    if (window.Magic.project && typeof window.Magic.project.createTopicAndSend === "function") {
      var opts = { model: model };
      if (agentId) opts.agentId = agentId;

      status.textContent = "Creating topic...";
      window.Magic.project.createTopicAndSend(full, opts).then(function () {
        status.textContent = "Created a new topic and sent the message.";
      }).catch(function (err) {
        status.textContent = "Send failed: " + (err.message || err);
      });
      return;
    }

    if (typeof window.Magic.setInputMessage === "function") {
      window.Magic.setInputMessage(full);
      status.textContent = "Sent to the current topic (fallback mode).";
      return;
    }

    status.textContent = "The current environment does not support message sending.";
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
        agentSel.innerHTML = "<option value=''>Unable to load</option>";
      });
    } else {
      agentSel.innerHTML = "<option value=''>Unavailable</option>";
    }

    if (window.Magic && window.Magic.llm && typeof window.Magic.llm.getModels === "function") {
      window.Magic.llm.getModels().then(function (models) {
        modelSel.innerHTML = "<option value=\"auto\">Auto select (recommended)</option>";
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

  bindSourcePreview();
  setupInsight();
  rebuild();
  window.addEventListener("resize", function () { charts.forEach(function (c) { c.resize(); }); });
})();
