(() => {
  "use strict";

  const STORAGE_KEY = "ctdp-rsip-field-kit-v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const APPOINTMENT_MS = 15 * 60 * 1000;
  const CURRENT_VIEWS = ["now", "policies", "guide", "records"];

  const POLICY_LIBRARY = [
    {
      id: "trap-avoidance",
      name: "陷阱规避",
      group: "安全",
      type: "passive",
      trigger: "只要准备坐上沙发",
      action: "手机留在沙发外",
      reason: "移除进入负向不可逃逸区的入口，减少之后每小时都要做的抵抗。",
      survive: 5
    },
    {
      id: "bath-first",
      name: "神清气爽",
      group: "节奏",
      type: "semi",
      trigger: "回家进门后 15 分钟内",
      action: "换洗衣物放进浴室并完成洗澡",
      reason: "挂靠在必定发生的回家动作上，借用因果链改善晚间状态。",
      survive: 5
    },
    {
      id: "dishes-now",
      name: "饭后清零",
      group: "秩序",
      type: "semi",
      trigger: "在家吃完最后一口饭",
      action: "立刻洗碗，结束后再离开餐桌",
      reason: "小维护成本换来一个持续整洁、低摩擦的环境边界。",
      survive: 5
    },
    {
      id: "morning-guard",
      name: "先发制人",
      group: "注意力",
      type: "passive",
      trigger: "无论几点起床",
      action: "起床后 30 分钟内不打开限制类 App",
      reason: "保护一天最早的行为惯性，避免清晨直接进入高刺激状态。",
      survive: 5
    },
    {
      id: "grayscale-night",
      name: "夜幕降临",
      group: "自动化",
      type: "passive",
      trigger: "每天 23:00",
      action: "手机自动进入黑白模式",
      reason: "几乎零维护成本，让娱乐刺激的奖励强度自然下降。",
      survive: 5
    },
    {
      id: "stand-to-scroll",
      name: "预备降级",
      group: "自动化",
      type: "semi",
      trigger: "23:00 后仍要继续玩手机",
      action: "只能站着玩",
      reason: "用姿势增加持续放纵的物理成本，不靠临场意志力硬拦。",
      survive: 5
    },
    {
      id: "phone-dock",
      name: "电子宵禁",
      group: "安全",
      type: "semi",
      trigger: "开始工作或学习",
      action: "手机放到伸手够不到、视线外的地方",
      reason: "把反复抵抗诱惑，改成一次性的空间布置。",
      survive: 5
    },
    {
      id: "before-bed-dock",
      name: "卧室外停靠",
      group: "睡眠",
      type: "semi",
      trigger: "准备洗漱睡觉",
      action: "先把手机放到卧室外充电",
      reason: "在身体进入睡前模式之前切断最容易失控的入口。",
      survive: 5
    },
    {
      id: "shoes-first",
      name: "出门线",
      group: "行动",
      type: "semi",
      trigger: "决定出门运动或去自习",
      action: "先穿鞋并打开门，再考虑是否继续",
      reason: "降低启动动作，不在门口继续做高成本的全盘决策。",
      survive: 4
    },
    {
      id: "victory-log",
      name: "赢麻了",
      group: "情绪",
      type: "active",
      trigger: "每天睡前复盘",
      action: "写下当天最大的一件事，并给当天命名",
      reason: "用低成本的情绪反馈改善状态，但需要主动执行，适合放置在后期。",
      survive: 3
    }
  ];

  const TYPE_LABELS = {
    passive: "被动",
    semi: "半被动",
    active: "主动"
  };

  const stateAdviceMap = {
    "逆风": "逆风局只守成：不加主动型国策，新规则必须在最差的一天也能轻松存活。",
    "一般": "一般局加小策：优先明确触发点、动作不超过两分钟、失败只影响局部的规则。",
    "顺风": "顺风局可扩线：可以尝试略高成本的国策，但仍然每天最多添加一条。"
  };

  const defaultState = () => ({
    version: 1,
    settings: {
      onboarded: false,
      anchor: {
        action: "",
        signal: "",
        minutes: 45,
        allowedBehaviors: [],
        createdAt: null
      }
    },
    ctdp: {
      mainChain: 0,
      bestChain: 0,
      totalSessions: 0,
      totalMinutes: 0,
      sessions: []
    },
    appointment: {
      chain: 0,
      armedAt: null,
      dueAt: null,
      allowedConditions: []
    },
    activeSession: null,
    rsip: {
      policies: [],
      lastAddedDate: null,
      freeze: null,
      archive: []
    },
    daily: {},
    logs: []
  });

  let appState = loadState();
  let currentView = "now";
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function mergeDeep(base, incoming) {
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      return incoming ?? base;
    }

    const output = Array.isArray(base) ? [] : { ...base };
    Object.keys(incoming).forEach((key) => {
      const baseValue = base && typeof base === "object" ? base[key] : undefined;
      const incomingValue = incoming[key];
      if (
        baseValue &&
        typeof baseValue === "object" &&
        !Array.isArray(baseValue) &&
        incomingValue &&
        typeof incomingValue === "object" &&
        !Array.isArray(incomingValue)
      ) {
        output[key] = mergeDeep(baseValue, incomingValue);
      } else {
        output[key] = incomingValue;
      }
    });
    return output;
  }

  function loadState() {
    const base = defaultState();
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return base;
    }
    const parsed = safeParse(stored);
    if (!parsed) {
      return base;
    }
    const merged = mergeDeep(base, parsed);
    merged.rsip.policies = Array.isArray(merged.rsip.policies) ? merged.rsip.policies : [];
    merged.rsip.archive = Array.isArray(merged.rsip.archive) ? merged.rsip.archive : [];
    merged.ctdp.sessions = Array.isArray(merged.ctdp.sessions) ? merged.ctdp.sessions : [];
    merged.logs = Array.isArray(merged.logs) ? merged.logs : [];
    return merged;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  }

  function dateKey(input = new Date()) {
    const date = new Date(input);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function displayDate(input = new Date()) {
    const date = new Date(input);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function displayDateTime(input) {
    if (!input) {
      return "";
    }
    const date = new Date(input);
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;
  }

  function daysBetween(start, end = Date.now()) {
    const from = new Date(start);
    const to = new Date(end);
    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((to - from) / DAY_MS));
  }

  function formatMinutes(total) {
    const minutes = Math.max(0, Math.round(Number(total) || 0));
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }

  function formatClock(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uid(prefix = "id") {
    if (crypto.randomUUID) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function todayRecord() {
    const key = dateKey();
    if (!appState.daily[key]) {
      appState.daily[key] = {
        state: null,
        sessions: 0,
        failures: 0,
        addedPolicy: false
      };
    }
    return appState.daily[key];
  }

  function addLog(type, title, detail = "", at = Date.now()) {
    appState.logs.unshift({
      id: uid("log"),
      type,
      title,
      detail,
      at
    });
    appState.logs = appState.logs.slice(0, 300);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function openSheet(title, body, options = {}) {
    const root = $("#modal-root");
    root.hidden = false;
    root.innerHTML = `
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header class="sheet-head">
          <div>
            ${options.eyebrow ? `<p class="eyebrow">${escapeHtml(options.eyebrow)}</p>` : ""}
            <h2 id="sheet-title">${escapeHtml(title)}</h2>
          </div>
          <button class="sheet-close" type="button" data-close-sheet aria-label="关闭">
            <svg><use href="#i-x"></use></svg>
          </button>
        </header>
        <div class="sheet-body">${body}</div>
      </section>
    `;

    const sheet = $(".sheet", root);
    root.onclick = (event) => {
      if (event.target === root || event.target.closest("[data-close-sheet]")) {
        closeSheet();
      }
    };
    sheet.focus?.();
    return sheet;
  }

  function closeSheet() {
    const root = $("#modal-root");
    root.hidden = true;
    root.innerHTML = "";
    root.onclick = null;
  }

  function navigate(view) {
    if (!CURRENT_VIEWS.includes(view)) {
      view = "now";
    }
    currentView = view;
    $$(".view").forEach((section) => section.classList.toggle("is-active", section.dataset.view === view));
    $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.go === view));
    if (location.hash !== `#${view}`) {
      history.replaceState(null, "", `#${view}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderAll();
  }

  function renderAll() {
    renderNow();
    renderPolicies();
    renderRecords();
  }

  function renderNow() {
    const anchor = appState.settings.anchor;
    $("#today-label").textContent = displayDate();
    $("#main-chain-count").textContent = appState.ctdp.mainChain;
    $("#best-chain").textContent = appState.ctdp.bestChain;
    $("#total-sessions").textContent = appState.ctdp.totalSessions;
    $("#focus-minutes").textContent = appState.ctdp.totalMinutes;

    const chain = appState.ctdp.mainChain;
    const chainMessages = [
      "先定义一个具体动作，让身体知道：锚点一触发，就必须专注。",
      "#1 是创世区块。它不需要你一直有动力，只需要下一次触发时仍然遵守规则。",
      "链条开始有重量了。现在放弃，失去的不是一个想法，而是已经完成的工作量证明。",
      "链条正在变成一件具体的东西。越接近 #10，临场讨价还价的空间越小。",
      "长链的约束力已经能替你承担一部分决策。继续只在触发锚点时对它负责。"
    ];
    let messageIndex = 0;
    if (chain >= 1 && chain < 3) messageIndex = 1;
    if (chain >= 3 && chain < 6) messageIndex = 2;
    if (chain >= 6 && chain < 10) messageIndex = 3;
    if (chain >= 10) messageIndex = 4;
    $("#chain-message").textContent = chainMessages[messageIndex];
    $("#chain-track-fill").style.width = `${Math.min(100, (chain / 30) * 100)}%`;

    if (anchor.action) {
      $("#anchor-action").textContent = anchor.action;
      $("#anchor-condition").textContent =
        `${anchor.signal ? `启动信号：${anchor.signal} · ` : ""}默认 ${anchor.minutes} 分钟 · ${
          anchor.allowedBehaviors.length
        } 条永久判例`;
      $("#start-now-button span").textContent = "触发锚点，直接开始";
    } else {
      $("#anchor-action").textContent = "尚未设置神圣锚点";
      $("#anchor-condition").textContent = "设置一个 5 秒内能做到、且足够显眼的动作。";
      $("#start-now-button span").textContent = "先设置神圣锚点";
    }

    renderStateSelector();
    renderAppointmentBanner();
    renderTodayPolicySummary();
  }

  function renderStateSelector() {
    const daily = todayRecord();
    $$("#state-selector button").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.state === daily.state);
    });
    $("#state-advice").textContent = daily.state
      ? stateAdviceMap[daily.state]
      : "先判断状态。逆风局里，不加任何靠主动性维持的新规则。";
  }

  function renderAppointmentBanner() {
    const banner = $("#appointment-banner");
    const appointment = appState.appointment;
    if (!appointment.dueAt) {
      banner.hidden = true;
      banner.innerHTML = "";
      return;
    }

    banner.hidden = false;
    const remaining = appointment.dueAt - Date.now();
    const isOverdue = remaining <= 0;
    const chainText = appointment.chain ? `预约链 #${appointment.chain}` : "预约链尚未建立";
    banner.innerHTML = `
      <strong>${isOverdue ? "预约已到期" : `预约倒计时 ${formatClock(remaining)}`}</strong>
      <p>${escapeHtml(chainText)}。现在只判断一件事：是否已触发神圣锚点并准备开始。</p>
      <div class="banner-actions">
        <button class="button button-primary" type="button" id="appointment-arrived">
          <svg><use href="#i-check"></use></svg><span>我已触发锚点</span>
        </button>
        <button class="button button-quiet" type="button" id="appointment-failed">
          <svg><use href="#i-alert"></use></svg><span>进入判例</span>
        </button>
      </div>
    `;
  }

  function renderTodayPolicySummary() {
    const container = $("#today-policy-summary");
    const policies = appState.rsip.policies;
    if (!policies.length) {
      container.innerHTML = `
        <span class="mini-chip"><b>0</b> 条国策待建立</span>
        <span class="mini-chip"><b>1</b> 条今日添加额度</span>
      `;
      return;
    }
    const frozenIds = activeFreezeIds();
    const frozenCount = policies.filter((policy) => frozenIds.has(policy.id)).length;
    const addedToday = appState.rsip.lastAddedDate === dateKey();
    container.innerHTML = `
      <span class="mini-chip"><b>${policies.length}</b> 条已点亮</span>
      <span class="mini-chip"><b>${frozenCount}</b> 条冻结中</span>
      <span class="mini-chip"><b>${addedToday ? 0 : 1}</b> 条今日额度</span>
    `;
  }

  function activeFreezeIds() {
    const freeze = appState.rsip.freeze;
    if (!freeze || !Array.isArray(freeze.ids)) {
      return new Set();
    }
    return new Set(freeze.ids);
  }

  function renderPolicies() {
    $("#policy-count").textContent = appState.rsip.policies.length;
    const oldest = appState.rsip.policies.reduce((max, policy) => {
      const days = daysBetween(policy.addedAt);
      return Math.max(max, days);
    }, 0);
    $("#policy-oldest").textContent = oldest;
    renderFreezeBanner();
    renderPolicyTree();
  }

  function renderFreezeBanner() {
    const banner = $("#freeze-banner");
    const freeze = appState.rsip.freeze;
    if (!freeze || !freeze.ids?.length) {
      banner.hidden = true;
      banner.innerHTML = "";
      return;
    }

    const remaining = freeze.until - Date.now();
    banner.hidden = false;
    banner.innerHTML = `
      <strong>${remaining > 0 ? "水密隔舱生效中" : "水密隔舱已到期"}</strong>
      <p>${freeze.ids.length} 条国策暂时不参与结算，截止 ${displayDateTime(freeze.until)}。${
        freeze.reason ? `事由：${escapeHtml(freeze.reason)}。` : ""
      }</p>
      <div class="banner-actions">
        <button class="button button-secondary" type="button" id="resolve-freeze-button">
          <svg><use href="#i-check"></use></svg><span>${remaining > 0 ? "提前清点并解冻" : "逐条清点并解冻"}</span>
        </button>
      </div>
    `;
  }

  function renderPolicyTree() {
    const container = $("#policy-tree");
    const policies = appState.rsip.policies;
    if (!policies.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg><use href="#i-tree"></use></svg>
          <strong>从“傻瓜国策”开始</strong>
          <p>它应该具体、挂在固定触发点上，并且在最糟糕的一天也能存活。</p>
        </div>
      `;
      return;
    }

    const children = new Map();
    const policyMap = new Map(policies.map((policy) => [policy.id, policy]));
    policies.forEach((policy) => {
      const parent = policy.parentId && policyMap.has(policy.parentId) ? policy.parentId : "__root__";
      if (!children.has(parent)) {
        children.set(parent, []);
      }
      children.get(parent).push(policy);
    });

    const frozenIds = activeFreezeIds();
    const renderBranch = (parentId, depth = 0) =>
      (children.get(parentId) || [])
        .sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt))
        .map((policy) => {
          const childMarkup = renderBranch(policy.id, depth + 1);
          return `
            <div class="policy-branch">
              <article class="policy-node ${frozenIds.has(policy.id) ? "is-frozen" : ""}" data-depth="${Math.min(depth, 4)}">
                <div class="policy-node-head">
                  <div>
                    <h3>${escapeHtml(policy.name)}</h3>
                    <p>${escapeHtml(policy.reason)}</p>
                  </div>
                  <span class="rule-badge ${policy.type === "passive" ? "green" : ""}">${TYPE_LABELS[policy.type]}</span>
                </div>
                <p class="policy-rule"><b>触发：</b>${escapeHtml(policy.trigger)}<br><b>动作：</b>${escapeHtml(
            policy.action
          )}</p>
                <div class="node-actions">
                  <div class="node-meta">
                    <span>${daysBetween(policy.addedAt)} 天</span>
                    <span>逆风存活 ${policy.survive}/5</span>
                    ${frozenIds.has(policy.id) ? "<span>隔舱冻结</span>" : ""}
                  </div>
                  <button class="node-action" type="button" data-fail-policy="${policy.id}">报告崩塌</button>
                </div>
              </article>
              ${childMarkup}
            </div>
          `;
        })
        .join("");

    container.innerHTML = renderBranch("__root__");
  }

  function renderRecords() {
    const sessions = appState.ctdp.sessions;
    $("#metric-sessions").textContent = appState.ctdp.totalSessions;
    $("#metric-hours").textContent = (appState.ctdp.totalMinutes / 60).toFixed(1);
    $("#metric-best").textContent = appState.ctdp.bestChain;
    $("#metric-rollbacks").textContent = appState.rsip.archive.length;

    const grid = $("#activity-grid");
    const cells = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let offset = 27; offset >= 0; offset -= 1) {
      const date = new Date(today.getTime() - offset * DAY_MS);
      const record = appState.daily[dateKey(date)] || { sessions: 0 };
      const level = Math.min(4, Number(record.sessions) || 0);
      cells.push(
        `<div class="activity-cell" data-level="${level}" title="${displayDate(date)}：${
          record.sessions || 0
        } 次"></div>`
      );
    }
    grid.innerHTML = cells.join("");

    const logList = $("#log-list");
    if (!appState.logs.length) {
      logList.innerHTML = `
        <div class="empty-state">
          <svg><use href="#i-chart"></use></svg>
          <strong>还没有记录</strong>
          <p>完成第一轮主链或国策回滚后，这里会出现本地流水。</p>
        </div>
      `;
      return;
    }

    logList.innerHTML = appState.logs
      .slice(0, 20)
      .map((item) => {
        const symbol = item.type === "success" ? "✓" : item.type === "fail" ? "!" : "·";
        return `
          <div class="log-item">
            <span class="log-type ${item.type}">${symbol}</span>
            <span class="log-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.detail || "")}</span>
            </span>
            <time class="log-time">${displayDateTime(item.at)}</time>
          </div>
        `;
      })
      .join("");
  }

  function openAnchorEditor(isOnboarding = false) {
    const anchor = appState.settings.anchor;
    openSheet(
      isOnboarding ? "先定义神圣锚点" : "神圣锚点设置",
      `
        <form id="anchor-form" class="form-grid">
          <p class="form-note">锚点不是目标，而是一个具体、显眼、5 秒内能做到的动作。触发它，就进入一次明确专注；没有准备好专注，就不要触发它。</p>
          <div class="field">
            <label for="anchor-action-input">锚点动作</label>
            <input class="input" id="anchor-action-input" name="action" required maxlength="40"
              placeholder="例如：深呼吸三次后戴上蓝色帽子" value="${escapeHtml(anchor.action)}">
            <small>最好由身体动作完成，而不是只在心里想“我要认真了”。</small>
          </div>
          <div class="field">
            <label for="anchor-signal-input">预约信号</label>
            <input class="input" id="anchor-signal-input" name="signal" maxlength="30"
              placeholder="例如：打一次响指" value="${escapeHtml(anchor.signal)}">
            <small>预约信号触发后，15 分钟内必须去触发锚点。</small>
          </div>
          <div class="field">
            <label for="anchor-minutes-select">默认专注时长</label>
            <select class="select" id="anchor-minutes-select" name="minutes">
              ${[25, 45, 60].map((minutes) => `<option value="${minutes}" ${anchor.minutes === minutes ? "selected" : ""}>${minutes} 分钟</option>`).join("")}
            </select>
          </div>
          <div class="form-actions">
            <button class="button button-primary button-large" type="submit">
              <svg><use href="#i-check"></use></svg><span>保存锚点</span>
            </button>
            ${isOnboarding ? "" : '<button class="button button-quiet" type="button" data-close-sheet>取消</button>'}
          </div>
        </form>
      `,
      { eyebrow: isOnboarding ? "STEP 01" : "CTDP" }
    );

    $("#anchor-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      appState.settings.anchor.action = String(formData.get("action") || "").trim();
      appState.settings.anchor.signal = String(formData.get("signal") || "").trim();
      appState.settings.anchor.minutes = Number(formData.get("minutes")) || 45;
      appState.settings.anchor.createdAt ||= Date.now();
      appState.settings.onboarded = true;
      addLog("info", "建立神圣锚点", appState.settings.anchor.action);
      saveState();
      closeSheet();
      renderAll();
      showToast("锚点已建立。下次先触发它，再开始。");
    });
  }

  function openAnchorHelp() {
    openSheet(
      "锚点只在精选状态负责",
      `
        <div class="boundary-list">
          <p><b>不要预支。</b>如果现在不想专注，就不要触发锚点。预约信号只负责在 15 分钟后把你送到锚点前。</p>
          <p><b>不要灵活解释。</b>中途出现问题，走“下必为例”：要么清空主链，要么永久允许这个行为。</p>
          <p><b>不要暴露给全天。</b>锚点有效，正因为它只对你主动选中的专注时段负责，而不是监督你的一整天。</p>
        </div>
      `,
      { eyebrow: "CTDP" }
    );
  }

  function armAppointment() {
    if (!appState.settings.anchor.action) {
      openAnchorEditor(false);
      return;
    }
    if (appState.appointment.dueAt && appState.appointment.dueAt > Date.now()) {
      showToast("预约信号已经触发，先完成这一次判例。");
      renderAppointmentBanner();
      return;
    }
    if (appState.appointment.dueAt) {
      showToast("上一次预约还没判定，请先处理到期横幅。");
      renderAppointmentBanner();
      return;
    }

    appState.appointment.armedAt = Date.now();
    appState.appointment.dueAt = Date.now() + APPOINTMENT_MS;
    addLog("info", "触发预约信号", "15 分钟内必须触发神圣锚点");
    saveState();
    renderAppointmentBanner();
    showToast("预约已启动：15 分钟内触发锚点。");
  }

  function handleAppointmentArrival() {
    if (!appState.appointment.dueAt) {
      return;
    }
    if (Date.now() <= appState.appointment.dueAt) {
      appState.appointment.chain += 1;
      appState.appointment.armedAt = null;
      appState.appointment.dueAt = null;
      addLog("success", `预约链 #${appState.appointment.chain}`, "在期限内触发锚点");
      saveState();
      renderAll();
      openStartForm({ scout: false, fromAppointment: false });
      return;
    }

    openAppointmentAdjudication(true);
  }

  function openAppointmentAdjudication(startAfter = false) {
    openSheet(
      "预约已经过期",
      `
        <p class="form-note">“下必为例”只有两个出口：承认约束失效并清空预约链，或者永久允许这种情况，从此它不再算违规。</p>
        <div class="verdict-grid">
          <button class="verdict-option danger" type="button" id="appointment-reset">
            <strong>判定失约：清空预约链</strong>
            <span>预约链归零，下一次从 #1 重新开始。</span>
          </button>
          <button class="verdict-option" type="button" id="appointment-allow">
            <strong>永久允许当前情形</strong>
            <span>这次不算违规，但以后同类情形都不再受预约规则约束。</span>
          </button>
        </div>
      `,
      { eyebrow: "判例" }
    );

    $("#appointment-reset").addEventListener("click", () => {
      appState.appointment.chain = 0;
      appState.appointment.armedAt = null;
      appState.appointment.dueAt = null;
      addLog("fail", "预约链清零", "预约超过 15 分钟仍未触发锚点");
      saveState();
      closeSheet();
      renderAll();
      if (startAfter) {
        openStartForm({ scout: false, fromAppointment: false });
      }
    });

    $("#appointment-allow").addEventListener("click", () => {
      appState.appointment.allowedConditions.push("预约后未在 15 分钟内落座");
      appState.appointment.armedAt = null;
      appState.appointment.dueAt = null;
      addLog("info", "预约规则新增永久判例", "允许预约后未在 15 分钟内落座");
      saveState();
      closeSheet();
      renderAll();
      showToast("已永久放行。预约链不会把这当作违规。");
      if (startAfter) {
        openStartForm({ scout: false, fromAppointment: false });
      }
    });
  }

  function openStartForm({ scout = false, fromAppointment = false } = {}) {
    const anchor = appState.settings.anchor;
    if (!anchor.action) {
      openAnchorEditor(false);
      return;
    }

    const defaultMinutes = scout ? 5 : anchor.minutes;
    openSheet(
      scout ? "5 分钟侦查任务" : "开始一轮主链任务",
      `
        <form id="start-session-form" class="form-grid">
          <p class="form-note">${
            scout
              ? "侦查任务不计入主链，也不怕失败。先让身体进入任务环境，5 分钟后再决定是否延长。"
              : "这次锚点一旦触发，就必须以当前可达到的最好状态完成。中途偏离时，系统会要求你作一次性判例。"
          }</p>
          <div class="field">
            <span class="field-label">锚点动作</span>
            <div class="anchor-card">
              <div class="anchor-icon"><svg><use href="#i-spark"></use></svg></div>
              <div>
                <strong>${escapeHtml(anchor.action)}</strong>
                <p>${anchor.signal ? `先执行：${escapeHtml(anchor.signal)}` : "直接执行上面的动作。"}</p>
              </div>
            </div>
          </div>
          <div class="field">
            <label for="intent-input">这一轮要推进的最小成果</label>
            <input class="input" id="intent-input" name="intent" required maxlength="60"
              placeholder="例如：写完第一章的提纲">
          </div>
          ${
            scout
              ? ""
              : `<div class="field">
                  <label for="session-minutes">专注时长</label>
                  <select class="select" id="session-minutes" name="minutes">
                    ${[25, 45, 60].map((minutes) => `<option value="${minutes}" ${defaultMinutes === minutes ? "selected" : ""}>${minutes} 分钟</option>`).join("")}
                  </select>
                </div>`
          }
          <div class="form-actions">
            <button class="button button-primary button-large" type="submit">
              <svg><use href="#i-play"></use></svg><span>我已触发锚点，开始</span>
            </button>
            <button class="button button-quiet" type="button" data-close-sheet>还没有准备好</button>
          </div>
        </form>
      `,
      { eyebrow: scout ? "SCOUT RUN" : fromAppointment ? "APPOINTMENT" : "CTDP" }
    );

    $("#start-session-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const targetMinutes = scout ? 5 : Number(formData.get("minutes")) || anchor.minutes;
      appState.activeSession = {
        id: uid("session"),
        startedAt: Date.now(),
        targetMinutes,
        intent: String(formData.get("intent") || "").trim(),
        isScout: scout,
        source: fromAppointment ? "appointment" : "direct",
        status: "running"
      };
      saveState();
      closeSheet();
      renderSession();
    });
  }

  function renderSession() {
    const screen = $("#session-screen");
    const session = appState.activeSession;
    if (!session) {
      screen.hidden = true;
      screen.innerHTML = "";
      return;
    }
    screen.hidden = false;
    const targetMs = session.targetMinutes * 60 * 1000;
    screen.innerHTML = `
      <div class="session-shell">
        <header class="session-top">
          <span>${session.isScout ? "SCOUT / 5 MIN" : `MAIN CHAIN / #${appState.ctdp.mainChain + 1}`}</span>
          <span>${session.source === "appointment" ? "APPOINTMENT" : "DIRECT"}</span>
        </header>
        <main class="session-main">
          <p class="session-anchor">${escapeHtml(appState.settings.anchor.action)}</p>
          <p class="session-intent">${escapeHtml(session.intent)}</p>
          <div class="timer-ring" aria-label="剩余时间">
            <svg viewBox="0 0 250 250" aria-hidden="true">
              <circle class="ring-track" cx="125" cy="125" r="112"></circle>
              <circle class="ring-value" id="timer-ring-value" cx="125" cy="125" r="112"></circle>
            </svg>
            <div class="timer-copy">
              <strong id="session-timer">${formatClock(targetMs)}</strong>
              <span>${session.isScout ? "侦查不计链" : "保持当前规则"}</span>
            </div>
          </div>
        </main>
        <footer>
          <div class="session-actions">
            <button class="button button-primary button-large" type="button" id="complete-session-button" disabled>
              <svg><use href="#i-check"></use></svg>
              <span>${session.isScout ? "结束侦查，不计主链" : `完成并结算 #${appState.ctdp.mainChain + 1}`}</span>
            </button>
            ${
              session.isScout
                ? `<button class="button" type="button" id="convert-scout-button" disabled>
                    <svg><use href="#i-chain"></use></svg><span>状态已打开：转为 45 分钟主链</span>
                  </button>`
                : ""
            }
            <button class="button" type="button" id="deviation-button">
              <svg><use href="#i-alert"></use></svg><span>记录一次偏离 / 异常</span>
            </button>
          </div>
          <p class="session-note">计时未到也可作判例；不要在“这次特殊”的模糊地带继续。</p>
        </footer>
      </div>
    `;

    $("#complete-session-button").addEventListener("click", completeSession);
    $("#deviation-button").addEventListener("click", () => openDeviationSheet());
    if (session.isScout) {
      $("#convert-scout-button").addEventListener("click", convertScoutToMain);
    }
    tickSession();
  }

  function tickSession() {
    const session = appState.activeSession;
    if (!session) {
      return;
    }
    const targetMs = session.targetMinutes * 60 * 1000;
    const elapsed = Date.now() - session.startedAt;
    const remaining = Math.max(0, targetMs - elapsed);
    const timer = $("#session-timer");
    const ring = $("#timer-ring-value");
    const completeButton = $("#complete-session-button");
    const convertButton = $("#convert-scout-button");

    if (timer) {
      timer.textContent = formatClock(remaining);
    }
    if (ring) {
      const circumference = 2 * Math.PI * 112;
      const progress = Math.min(1, elapsed / targetMs);
      ring.style.strokeDasharray = String(circumference);
      ring.style.strokeDashoffset = String(circumference * (1 - progress));
    }
    if (completeButton) {
      completeButton.disabled = remaining > 0;
    }
    if (convertButton) {
      convertButton.disabled = remaining > 0;
    }
  }

  function completeSession() {
    const session = appState.activeSession;
    if (!session) {
      return;
    }
    const targetMs = session.targetMinutes * 60 * 1000;
    if (Date.now() - session.startedAt < targetMs) {
      return;
    }

    const actualMinutes = Math.max(session.targetMinutes, Math.round((Date.now() - session.startedAt) / 60000));
    const daily = todayRecord();
    daily.sessions += 1;

    if (session.isScout) {
      addLog("success", "完成 5 分钟侦查", session.intent);
      appState.activeSession = null;
      saveState();
      hideSession();
      renderAll();
      showToast("侦查完成，不计主链。状态已经打开。");
      return;
    }

    appState.ctdp.mainChain += 1;
    appState.ctdp.bestChain = Math.max(appState.ctdp.bestChain, appState.ctdp.mainChain);
    appState.ctdp.totalSessions += 1;
    appState.ctdp.totalMinutes += actualMinutes;
    appState.ctdp.sessions.unshift({
      id: session.id,
      completedAt: Date.now(),
      startedAt: session.startedAt,
      minutes: actualMinutes,
      intent: session.intent,
      chain: appState.ctdp.mainChain
    });
    appState.ctdp.sessions = appState.ctdp.sessions.slice(0, 180);
    addLog("success", `主链 #${appState.ctdp.mainChain}`, `${actualMinutes} 分钟 · ${session.intent}`);
    const completedChain = appState.ctdp.mainChain;
    appState.activeSession = null;
    saveState();
    renderSessionComplete(completedChain);
  }

  function convertScoutToMain() {
    const session = appState.activeSession;
    if (!session || !session.isScout) {
      return;
    }
    if (Date.now() - session.startedAt < 5 * 60 * 1000) {
      return;
    }
    session.isScout = false;
    session.targetMinutes = 45;
    session.source = "scout-converted";
    saveState();
    renderSession();
    showToast("已转为主链：仍在同一条时间线，需要达到 45 分钟。");
  }

  function hideSession() {
    const screen = $("#session-screen");
    screen.hidden = true;
    screen.innerHTML = "";
  }

  function renderSessionComplete(chain) {
    const screen = $("#session-screen");
    screen.hidden = false;
    screen.innerHTML = `
      <div class="session-shell">
        <header class="session-top">
          <span>WORK PROOF ACCEPTED</span>
          <span>LOCAL / UNALTERED</span>
        </header>
        <main class="session-main">
          <p class="session-anchor">工作量证明已写入主链</p>
          <div class="chain-number" style="color:var(--paper-light);margin:18px 0 28px">
            <span class="hash">#</span><span>${chain}</span>
          </div>
          <p class="session-intent">这一步已经过去。不要急着评价整天的自己，让它成为下一次锚点的承重。</p>
        </main>
        <footer class="session-actions">
          <button class="button button-primary button-large" type="button" id="close-complete-button">
            <svg><use href="#i-check"></use></svg><span>收下 #${chain}</span>
          </button>
          <button class="button" type="button" id="another-round-button">
            <svg><use href="#i-play"></use></svg><span>立刻再来一轮</span>
          </button>
        </footer>
      </div>
    `;
    $("#close-complete-button").addEventListener("click", () => {
      hideSession();
      renderAll();
    });
    $("#another-round-button").addEventListener("click", () => {
      hideSession();
      renderAll();
      openStartForm({ scout: false, fromAppointment: false });
    });
  }

  function openDeviationSheet() {
    const session = appState.activeSession;
    if (!session) {
      return;
    }
    openSheet(
      "偏离判例",
      `
        <div class="rule-badge">下必为例</div>
        <p class="form-note">不要让“这次特殊”留在灰区。只要允许这一次，未来同类行为就必须一律允许；如果不该永久允许，就只能清空整条主链。</p>
        <div class="field">
          <label for="deviation-input">刚才发生了什么？</label>
          <textarea class="textarea" id="deviation-input" maxlength="80" placeholder="例如：中途刷了两分钟短视频"></textarea>
        </div>
        <div class="verdict-grid" style="margin-top:14px">
          <button class="verdict-option danger" type="button" id="deviation-reset">
            <strong>判定违规：清空主链</strong>
            <span>当前这一轮结束，主链从 #1 重新开始。</span>
          </button>
          <button class="verdict-option" type="button" id="deviation-allow">
            <strong>永久允许：此行为以后都算合规</strong>
            <span>链条保留，这一行为从此不再作为违规判据。</span>
          </button>
        </div>
      `,
      { eyebrow: "CTDP / 判例" }
    );

    $("#deviation-reset").addEventListener("click", () => {
      const detail = $("#deviation-input").value.trim() || "未填写具体行为";
      appState.ctdp.mainChain = 0;
      todayRecord().failures += 1;
      addLog("fail", "主链清零", detail);
      appState.activeSession = null;
      saveState();
      closeSheet();
      hideSession();
      renderAll();
      showToast("主链已清零。重新从 #1 开始。");
    });

    $("#deviation-allow").addEventListener("click", () => {
      const detail = $("#deviation-input").value.trim();
      if (!detail) {
        showToast("写下要永久允许的行为，判例才会生效。");
        return;
      }
      appState.settings.anchor.allowedBehaviors.push(detail);
      addLog("info", "新增永久判例", detail);
      saveState();
      closeSheet();
      renderAll();
      renderSession();
      showToast("已永久允许。以后遇到同类行为，不再触发违规。");
    });
  }

  function openPolicyPicker() {
    if (appState.rsip.lastAddedDate === dateKey()) {
      showToast("今天已经添加过一条国策。明天再扩线。");
      return;
    }
    const state = todayRecord().state;
    const filtered = POLICY_LIBRARY.filter((policy) => {
      if (state === "逆风") {
        return policy.type !== "active" && policy.survive >= 5;
      }
      if (state === "一般") {
        return policy.type !== "active" && policy.survive >= 4;
      }
      return true;
    });

    openSheet(
      "添加一条国策",
      `
        <p class="form-note">${
          state
            ? escapeHtml(stateAdviceMap[state])
            : "还没有判断今天的状态。建议先回到“现在”页选择逆风、一般或顺风。"
        }</p>
        <div class="choice-grid" style="margin-top:14px">
          ${filtered
            .map(
              (policy) => `
                <button class="choice-card" type="button" data-policy-template="${policy.id}">
                  <span class="choice-icon">${policy.survive}/5</span>
                  <span>
                    <strong>${escapeHtml(policy.name)} · ${TYPE_LABELS[policy.type]}</strong>
                    <small>${escapeHtml(policy.trigger)} → ${escapeHtml(policy.action)}</small>
                  </span>
                </button>
              `
            )
            .join("")}
          <button class="choice-card" type="button" id="custom-policy-button">
            <span class="choice-icon">+</span>
            <span>
              <strong>自定义国策</strong>
              <small>适合已经能说清触发点、具体动作和逆风存活条件的人。</small>
            </span>
          </button>
        </div>
      `,
      { eyebrow: "RSIP / 每天最多一条" }
    );

    $$("[data-policy-template]").forEach((button) => {
      button.addEventListener("click", () => {
        const template = POLICY_LIBRARY.find((policy) => policy.id === button.dataset.policyTemplate);
        openPolicyDraft(template);
      });
    });
    $("#custom-policy-button").addEventListener("click", () => openPolicyDraft(null));
  }

  function openPolicyDraft(template) {
    const policies = appState.rsip.policies;
    const entry = template || {
      name: "",
      group: "自定义",
      type: "semi",
      trigger: "",
      action: "",
      reason: "",
      survive: 5
    };
    openSheet(
      template ? `校对：${template.name}` : "设计自定义国策",
      `
        <form id="policy-form" class="form-grid">
          <p class="form-note">一个好国策不是目标，而是“如果 A 发生，就做 B”。它必须具体、低成本，并且在状态最差的一天也有较高存活概率。</p>
          <div class="field">
            <label for="policy-name">国策名称</label>
            <input class="input" id="policy-name" name="name" required maxlength="20" value="${escapeHtml(entry.name)}"
              placeholder="例如：饭后清零">
          </div>
          <div class="field">
            <label for="policy-trigger">触发条件</label>
            <input class="input" id="policy-trigger" name="trigger" required maxlength="50" value="${escapeHtml(entry.trigger)}"
              placeholder="例如：在家吃完最后一口饭">
          </div>
          <div class="field">
            <label for="policy-action">具体动作</label>
            <input class="input" id="policy-action" name="action" required maxlength="60" value="${escapeHtml(entry.action)}"
              placeholder="例如：立刻洗碗">
          </div>
          <div class="field">
            <label for="policy-reason">它拦住的负面稳态</label>
            <input class="input" id="policy-reason" name="reason" maxlength="90" value="${escapeHtml(entry.reason)}"
              placeholder="一句话说明杠杆在哪里">
          </div>
          <div class="field">
            <label for="policy-type">类型</label>
            <select class="select" id="policy-type" name="type">
              <option value="passive" ${entry.type === "passive" ? "selected" : ""}>被动：特定情况下砍掉选项</option>
              <option value="semi" ${entry.type === "semi" ? "selected" : ""}>半被动：挂靠固定触发条件</option>
              <option value="active" ${entry.type === "active" ? "selected" : ""}>主动：每天需要记得并安排时间</option>
            </select>
          </div>
          <div class="field">
            <label for="policy-survive">逆风存活评分</label>
            <select class="select" id="policy-survive" name="survive">
              ${[5, 4, 3, 2, 1]
                .map(
                  (score) =>
                    `<option value="${score}" ${Number(entry.survive) === score ? "selected" : ""}>${score}/5${
                      score === 5 ? " · 最糟的一天也能轻松做到" : score === 3 ? " · 状态一般时才做得到" : score <= 2 ? " · 只在顺风局成立" : ""
                    }</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="policy-parent">挂载位置</label>
            <select class="select" id="policy-parent" name="parentId">
              <option value="">新建根分支（更受保护）</option>
              ${policies
                .map(
                  (policy) =>
                    `<option value="${policy.id}">${escapeHtml(policy.name)} → 作为子节点</option>`
                )
                .join("")}
            </select>
            <small>根节点适合“穿越牛熊”的小规则；主动型或高成本规则优先放在子节点。</small>
          </div>
          <div class="form-actions">
            <button class="button button-primary button-large" type="submit">
              <svg><use href="#i-plus"></use></svg><span>点亮这条国策</span>
            </button>
            <button class="button button-quiet" type="button" data-close-sheet>再想想</button>
          </div>
        </form>
      `,
      { eyebrow: "RSIP / 胜于易胜" }
    );

    $("#policy-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const survive = Number(formData.get("survive"));
      const type = String(formData.get("type"));
      const parentId = String(formData.get("parentId") || "");
      const currentState = todayRecord().state;

      if (!parentId && survive < 4) {
        showToast("逆风存活低于 4/5 的规则不能做根节点。先挂到已有国策下面。");
        return;
      }
      if (type === "active" && currentState !== "顺风") {
        showToast("主动型国策只适合顺风局，当前先使用被动或半被动规则。");
        return;
      }
      if (appState.rsip.lastAddedDate === dateKey()) {
        showToast("今天已经添加过一条国策。");
        return;
      }

      const policy = {
        id: uid("policy"),
        name: String(formData.get("name") || "").trim(),
        trigger: String(formData.get("trigger") || "").trim(),
        action: String(formData.get("action") || "").trim(),
        reason: String(formData.get("reason") || "").trim() || "在有效节点上切断负面稳态。",
        type,
        survive,
        group: String(entry.group || "自定义"),
        parentId: parentId || null,
        addedAt: Date.now()
      };
      appState.rsip.policies.push(policy);
      appState.rsip.lastAddedDate = dateKey();
      todayRecord().addedPolicy = true;
      addLog("success", `点亮国策：${policy.name}`, `${policy.trigger} → ${policy.action}`);
      saveState();
      closeSheet();
      renderAll();
      showToast("国策已点亮。守住时不用打卡，崩塌时再来报告。");
    });
  }

  function reportPolicyFailure(policyId) {
    const policy = appState.rsip.policies.find((item) => item.id === policyId);
    if (!policy) {
      return;
    }
    const descendants = collectDescendantIds(policyId);
    openSheet(
      `国策崩塌：${policy.name}`,
      `
        <p class="form-note">崩塌是调试器，不是人格失败。删除这个节点会同时回滚它的 ${descendants.length} 个子节点；旧规则的内化进度仍会部分保留。</p>
        <div class="verdict-grid">
          <button class="verdict-option danger" type="button" id="confirm-policy-failure">
            <strong>确认崩塌并回滚子树</strong>
            <span>共删除 ${descendants.length + 1} 条规则。明天可从小一号的动作重新尝试。</span>
          </button>
          <button class="verdict-option" type="button" data-close-sheet>
            <strong>先不删除</strong>
            <span>仅当你确认这次是误触或记录错误。</span>
          </button>
        </div>
      `,
      { eyebrow: "RSIP / 递归回溯" }
    );

    $("#confirm-policy-failure").addEventListener("click", () => {
      const removedPolicies = appState.rsip.policies.filter((item) => descendants.includes(item.id) || item.id === policyId);
      appState.rsip.policies = appState.rsip.policies.filter(
        (item) => !(descendants.includes(item.id) || item.id === policyId)
      );
      appState.rsip.archive.unshift({
        id: uid("archive"),
        policyName: policy.name,
        removedAt: Date.now(),
        count: removedPolicies.length,
        names: removedPolicies.map((item) => item.name)
      });
      if (appState.rsip.freeze) {
        appState.rsip.freeze.ids = appState.rsip.freeze.ids.filter((id) => id !== policyId && !descendants.includes(id));
      }
      todayRecord().failures += 1;
      addLog("fail", `回滚国策：${policy.name}`, `连同 ${descendants.length} 个子节点一并删除`);
      saveState();
      closeSheet();
      renderAll();
      showToast(`已回滚 ${removedPolicies.length} 条规则。路径信息已保留。`);
    });
  }

  function collectDescendantIds(policyId) {
    const output = [];
    const queue = [policyId];
    while (queue.length) {
      const current = queue.shift();
      appState.rsip.policies
        .filter((policy) => policy.parentId === current)
        .forEach((child) => {
          output.push(child.id);
          queue.push(child.id);
        });
    }
    return output;
  }

  function openFreezeSheet() {
    const policies = appState.rsip.policies;
    if (!policies.length) {
      showToast("还没有国策可以冻结。");
      return;
    }
    if (appState.rsip.freeze) {
      openFreezeResolution();
      return;
    }

    openSheet(
      "启动水密隔舱",
      `
        <p class="form-note">只为生病、出差等不可抗力留出标准出口。到期后必须逐条清点；不能把模糊的“状态不好”变成无限豁免。</p>
        <form id="freeze-form" class="form-grid">
          <div class="field">
            <span class="field-label">选择冻结范围</span>
            <div class="check-list">
              ${policies
                .map(
                  (policy) => `
                    <label class="check-row">
                      <input type="checkbox" name="freezeIds" value="${policy.id}" checked>
                      <span>
                        <strong>${escapeHtml(policy.name)}</strong>
                        <small>${escapeHtml(policy.action)}</small>
                      </span>
                    </label>
                  `
                )
                .join("")}
            </div>
          </div>
          <div class="field">
            <label for="freeze-duration">冻结时长</label>
            <select class="select" id="freeze-duration" name="days">
              <option value="1">1 天</option>
              <option value="3" selected>3 天</option>
              <option value="7">7 天</option>
            </select>
          </div>
          <div class="field">
            <label for="freeze-reason">不可抗力事由</label>
            <input class="input" id="freeze-reason" name="reason" required maxlength="60" placeholder="例如：高烧，无法正常起床">
          </div>
          <div class="form-actions">
            <button class="button button-primary button-large" type="submit">
              <svg><use href="#i-snow"></use></svg><span>启动隔舱</span>
            </button>
          </div>
        </form>
      `,
      { eyebrow: "RSIP / 标准容错" }
    );

    $("#freeze-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const ids = formData.getAll("freezeIds").map(String);
      if (!ids.length) {
        showToast("至少选择一条国策。");
        return;
      }
      const days = Number(formData.get("days")) || 3;
      const reason = String(formData.get("reason") || "").trim();
      appState.rsip.freeze = {
        ids,
        until: Date.now() + days * DAY_MS,
        reason,
        startedAt: Date.now()
      };
      addLog("info", "启动水密隔舱", `${ids.length} 条国策冻结 ${days} 天 · ${reason}`);
      saveState();
      closeSheet();
      renderAll();
      showToast("水密隔舱已启动。冻结的节点暂不结算。");
    });
  }

  function openFreezeResolution() {
    const freeze = appState.rsip.freeze;
    if (!freeze) {
      return;
    }
    const frozenPolicies = appState.rsip.policies.filter((policy) => freeze.ids.includes(policy.id));
    if (!frozenPolicies.length) {
      appState.rsip.freeze = null;
      saveState();
      renderAll();
      closeSheet();
      return;
    }

    openSheet(
      "水密隔舱清点",
      `
        <p class="form-note">逐条判定。守住即可解冻；未满足则按规则熄灭并回滚其子树。</p>
        <div class="check-list">
          ${frozenPolicies
            .map(
              (policy) => `
                <div class="check-row">
                  <span style="flex:1">
                    <strong>${escapeHtml(policy.name)}</strong>
                    <small>${escapeHtml(policy.trigger)} → ${escapeHtml(policy.action)}</small>
                    <span class="banner-actions" style="margin-top:8px">
                      <button class="button button-secondary" type="button" data-freeze-keep="${policy.id}">守住了</button>
                      <button class="button button-danger-quiet" type="button" data-freeze-fail="${policy.id}">未满足</button>
                    </span>
                  </span>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="form-actions">
          <button class="button button-quiet" type="button" data-close-sheet>稍后继续清点</button>
        </div>
      `,
      { eyebrow: "水密隔舱到期" }
    );

    $$("[data-freeze-keep]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.freezeKeep;
        appState.rsip.freeze.ids = appState.rsip.freeze.ids.filter((item) => item !== id);
        addLog("success", "隔舱解冻：守住", appState.rsip.policies.find((item) => item.id === id)?.name || "");
        finishFreezeIfEmpty();
      });
    });

    $$("[data-freeze-fail]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.freezeFail;
        const policy = appState.rsip.policies.find((item) => item.id === id);
        if (!policy) {
          return;
        }
        const descendants = collectDescendantIds(id);
        const removedNames = appState.rsip.policies
          .filter((item) => item.id === id || descendants.includes(item.id))
          .map((item) => item.name);
        appState.rsip.policies = appState.rsip.policies.filter(
          (item) => item.id !== id && !descendants.includes(item.id)
        );
        appState.rsip.archive.unshift({
          id: uid("archive"),
          policyName: policy.name,
          removedAt: Date.now(),
          count: removedNames.length,
          names: removedNames
        });
        appState.rsip.freeze.ids = appState.rsip.freeze.ids.filter(
          (item) => item !== id && !descendants.includes(item)
        );
        todayRecord().failures += 1;
        addLog("fail", `隔舱未满足：${policy.name}`, "按规则回滚");
        finishFreezeIfEmpty();
      });
    });
  }

  function finishFreezeIfEmpty() {
    if (appState.rsip.freeze && appState.rsip.freeze.ids.length === 0) {
      appState.rsip.freeze = null;
      showToast("水密隔舱已全部清点。");
    }
    saveState();
    renderAll();
    if (appState.rsip.freeze) {
      openFreezeResolution();
    } else {
      closeSheet();
    }
  }

  function exportData() {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        app: "self-control-protocol",
        version: appState.version,
        data: appState
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `自控协议备份-${dateKey()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = safeParse(String(reader.result || ""));
      const incoming = parsed?.data || parsed;
      if (!incoming || typeof incoming !== "object" || !incoming.settings || !incoming.ctdp) {
        showToast("无法识别这个备份文件。");
        return;
      }
      appState = mergeDeep(defaultState(), incoming);
      saveState();
      renderAll();
      if (appState.activeSession) {
        renderSession();
      } else {
        hideSession();
      }
      showToast("备份已导入。");
    };
    reader.readAsText(file);
  }

  function openResetConfirmation() {
    openSheet(
      "重置全部数据",
      `
        <p class="form-note">这会删除主链、国策、日志和所有本地记录。操作无法撤销。建议先导出备份。</p>
        <div class="verdict-grid">
          <button class="verdict-option danger" type="button" id="confirm-reset">
            <strong>确认重置</strong>
            <span>完全清空本机数据，并重新进入锚点引导。</span>
          </button>
          <button class="verdict-option" type="button" data-close-sheet>
            <strong>取消</strong>
            <span>保留当前全部记录。</span>
          </button>
        </div>
      `,
      { eyebrow: "危险操作" }
    );
    $("#confirm-reset").addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });
  }

  function updateNetworkStatus() {
    const online = navigator.onLine;
    $("#network-dot").classList.toggle("is-offline", !online);
    $("#network-label").textContent = online ? "本地" : "离线可用";
  }

  function bindEvents() {
    $$("[data-go]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.go));
    });

    window.addEventListener("hashchange", () => {
      const view = location.hash.replace("#", "") || "now";
      if (view !== currentView) {
        navigate(view);
      }
    });

    $("#edit-anchor-button").addEventListener("click", () => openAnchorEditor(!appState.settings.anchor.action));
    $("#anchor-help").addEventListener("click", openAnchorHelp);
    $("#start-now-button").addEventListener("click", () => openStartForm({ scout: false, fromAppointment: false }));
    $("#arm-appointment-button").addEventListener("click", armAppointment);
    $("#start-scout-button").addEventListener("click", () => openStartForm({ scout: true, fromAppointment: false }));
    $("#add-policy-button").addEventListener("click", openPolicyPicker);
    $("#freeze-button").addEventListener("click", openFreezeSheet);

    $("#state-selector").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-state]");
      if (!button) {
        return;
      }
      todayRecord().state = button.dataset.state;
      saveState();
      renderStateSelector();
      renderTodayPolicySummary();
      showToast(`今日局面已设为“${button.dataset.state}”。`);
    });

    $("#policy-tree").addEventListener("click", (event) => {
      const button = event.target.closest("[data-fail-policy]");
      if (button) {
        reportPolicyFailure(button.dataset.failPolicy);
      }
    });

    $("#appointment-banner").addEventListener("click", (event) => {
      if (event.target.closest("#appointment-arrived")) {
        handleAppointmentArrival();
      }
      if (event.target.closest("#appointment-failed")) {
        openAppointmentAdjudication(false);
      }
    });

    $("#freeze-banner").addEventListener("click", (event) => {
      if (event.target.closest("#resolve-freeze-button")) {
        openFreezeResolution();
      }
    });

    $("#export-button").addEventListener("click", exportData);
    $("#import-input").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) {
        importData(file);
      }
      event.target.value = "";
    });
    $("#reset-button").addEventListener("click", openResetConfirmation);
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        renderAll();
        tickSession();
      }
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // GitHub Pages 或本地静态服务器都可用；注册失败不影响核心功能。
      });
    }
  }

  function init() {
    bindEvents();
    updateNetworkStatus();
    const initialView = location.hash.replace("#", "") || "now";
    navigate(CURRENT_VIEWS.includes(initialView) ? initialView : "now");
    registerServiceWorker();

    if (!appState.settings.onboarded) {
      window.setTimeout(() => openAnchorEditor(true), 180);
    } else if (appState.activeSession) {
      renderSession();
    }

    window.setInterval(() => {
      renderAppointmentBanner();
      tickSession();
    }, 1000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
