(function () {
  "use strict";

  var STORAGE_KEY = "incident-desk:v1";
  var THEME_KEY = "incident-desk:theme";

  var SERVICE_STATUSES = ["operational", "degraded", "partial-outage", "major-outage"];
  var SEVERITIES = ["sev-1", "sev-2", "sev-3", "sev-4"];
  var INCIDENT_STATUSES = ["open", "monitoring", "resolved"];
  var THEME_PREFS = ["system", "light", "dark"];

  var LIMIT_SERVICES = 100;
  var LIMIT_INCIDENTS = 500;
  var LIMIT_UPDATES = 500;

  var STATUS_LABELS = {
    operational: "Operational",
    degraded: "Degraded",
    "partial-outage": "Partial Outage",
    "major-outage": "Major Outage"
  };
  var SEVERITY_LABELS = {
    "sev-1": "SEV 1",
    "sev-2": "SEV 2",
    "sev-3": "SEV 3",
    "sev-4": "SEV 4"
  };
  var INCIDENT_STATUS_LABELS = {
    open: "Open",
    monitoring: "Monitoring",
    resolved: "Resolved"
  };

  var els = {};
  var state = { services: [], incidents: [] };
  var filters = { query: "", status: "", severity: "" };
  var expandedId = null;
  var themeMq = window.matchMedia("(prefers-color-scheme: dark)");

  // --- small type helpers ---

  function isObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  function isNum(v) {
    return typeof v === "number" && Number.isFinite(v);
  }

  function isStr(v) {
    return typeof v === "string";
  }

  function validISO(v) {
    if (!isStr(v)) return false;
    var t = Date.parse(v);
    if (Number.isNaN(t)) return false;
    return new Date(t).toISOString() === v;
  }

  // --- formatting ---

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function toLocalInputValue(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString() + " " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function ageFrom(iso) {
    var ms = Date.now() - Date.parse(iso);
    if (ms < 0) ms = 0;
    var m = Math.floor(ms / 60000);
    if (m < 60) return m + " min ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " h ago";
    return Math.floor(h / 24) + " d ago";
  }

  function announce(msg) {
    if (!els.live) return;
    els.live.textContent = "";
    window.setTimeout(function () {
      els.live.textContent = msg;
    }, 0);
  }

  // --- persistence ---

  function loadStored() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw === null ? null : JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function persist() {
    try {
      var doc = { v: 1, services: state.services, incidents: state.incidents };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch (e) {
      announce("Could not save: local storage is full or unavailable. Changes may be lost.");
    }
  }

  function nextIncidentId() {
    var max = 0;
    for (var i = 0; i < state.incidents.length; i++) {
      if (state.incidents[i].id > max) max = state.incidents[i].id;
    }
    return max + 1;
  }

  function findService(id) {
    for (var i = 0; i < state.services.length; i++) {
      if (state.services[i].id === id) return state.services[i];
    }
    return null;
  }

  // --- validation (shared by localStorage load and JSON import) ---

  function validateState(data) {
    if (!isObject(data)) return "Data must be a JSON object.";
    if (data.v !== undefined && data.v !== 1) {
      return "Unsupported data version: " + data.v + " (expected 1).";
    }
    if (!Array.isArray(data.services)) return "Missing or invalid 'services' array.";
    if (!Array.isArray(data.incidents)) return "Missing or invalid 'incidents' array.";
    if (data.services.length > LIMIT_SERVICES) {
      return "Too many services: " + data.services.length + " (limit " + LIMIT_SERVICES + ").";
    }
    if (data.incidents.length > LIMIT_INCIDENTS) {
      return "Too many incidents: " + data.incidents.length + " (limit " + LIMIT_INCIDENTS + ").";
    }

    var seenServiceIds = {};
    for (var i = 0; i < data.services.length; i++) {
      var s = data.services[i];
      var sPos = "services[" + i + "]";
      if (!isObject(s)) return sPos + " must be an object.";
      if (!isStr(s.id) || s.id.length === 0 || s.id.length > 64) {
        return sPos + ".id must be a non-empty string (max 64 chars).";
      }
      if (seenServiceIds[s.id]) return "Duplicate service id '" + s.id + "'.";
      seenServiceIds[s.id] = true;
      if (!isStr(s.name) || s.name.length === 0 || s.name.length > 80) {
        return sPos + ".name must be a non-empty string (max 80 chars).";
      }
      if (SERVICE_STATUSES.indexOf(s.status) === -1) {
        return sPos + ".status must be one of: " + SERVICE_STATUSES.join(", ") + ".";
      }
    }

    var seenIncidentIds = {};
    for (var j = 0; j < data.incidents.length; j++) {
      var inc = data.incidents[j];
      var pos = "incidents[" + j + "]";
      if (!isObject(inc)) return pos + " must be an object.";
      if (!isNum(inc.id) || !Number.isInteger(inc.id) || inc.id <= 0) {
        return pos + ".id must be a positive integer.";
      }
      if (seenIncidentIds[inc.id]) return "Duplicate incident id " + inc.id + ".";
      seenIncidentIds[inc.id] = true;
      if (SEVERITIES.indexOf(inc.severity) === -1) {
        return pos + ".severity must be one of: " + SEVERITIES.join(", ") + ".";
      }
      if (!isStr(inc.title) || inc.title.length === 0 || inc.title.length > 200) {
        return pos + ".title must be a non-empty string (max 200 chars).";
      }
      if (INCIDENT_STATUSES.indexOf(inc.status) === -1) {
        return pos + ".status must be one of: " + INCIDENT_STATUSES.join(", ") + ".";
      }
      if (!validISO(inc.startedAt)) {
        return pos + ".startedAt must be an ISO 8601 UTC timestamp (ends with Z).";
      }
      if (!validISO(inc.resolvedAt) && inc.resolvedAt !== null) {
        return pos + ".resolvedAt must be null or an ISO 8601 UTC timestamp.";
      }
      if (inc.status === "resolved" && !inc.resolvedAt) {
        return pos + " is resolved but has no resolvedAt timestamp.";
      }
      if (inc.resolvedAt && Date.parse(inc.resolvedAt) < Date.parse(inc.startedAt)) {
        return pos + " resolvedAt must not be earlier than startedAt.";
      }
      if (!Array.isArray(inc.services)) return pos + ".services must be an array.";
      var seenSvcRefs = {};
      for (var k = 0; k < inc.services.length; k++) {
        var ref = inc.services[k];
        if (!isStr(ref)) return pos + ".services[" + k + "] must be a string service id.";
        if (!seenServiceIds[ref]) return pos + ".services references unknown service id '" + ref + "'.";
        if (seenSvcRefs[ref]) return pos + " references service '" + ref + "' twice.";
        seenSvcRefs[ref] = true;
      }
      if (!Array.isArray(inc.updates)) return pos + ".updates must be an array.";
      if (inc.updates.length > LIMIT_UPDATES) {
        return pos + " has " + inc.updates.length + " updates (limit " + LIMIT_UPDATES + " per incident).";
      }
      for (var u = 0; u < inc.updates.length; u++) {
        var upd = inc.updates[u];
        var uPos = pos + ".updates[" + u + "]";
        if (!isObject(upd)) return uPos + " must be an object.";
        if (!validISO(upd.at)) return uPos + ".at must be an ISO 8601 UTC timestamp (ends with Z).";
        if (!isStr(upd.author) || upd.author.length === 0 || upd.author.length > 60) {
          return uPos + ".author must be a non-empty string (max 60 chars).";
        }
        if (!isStr(upd.body) || upd.body.length === 0 || upd.body.length > 2000) {
          return uPos + ".body must be a non-empty string (max 2000 chars).";
        }
      }
    }
    return null;
  }

  // --- demo data ---

  function demoState() {
    var now = Date.now();
    function at(minAgo) {
      return new Date(now - minAgo * 60000).toISOString();
    }
    return {
      services: [
        { id: "svc-web", name: "Public Web Frontend", status: "degraded" },
        { id: "svc-api", name: "Core API", status: "operational" },
        { id: "svc-pay", name: "Payments API", status: "partial-outage" },
        { id: "svc-cart", name: "Shopping Cart", status: "major-outage" },
        { id: "svc-search", name: "Search", status: "operational" },
        { id: "svc-auth", name: "Authentication", status: "operational" },
        { id: "svc-batch", name: "Nightly Batch Jobs", status: "operational" },
        { id: "svc-email", name: "Email Delivery", status: "degraded" }
      ],
      incidents: [
        {
          id: 1,
          severity: "sev-1",
          title: "Shopping Cart cannot create new carts",
          services: ["svc-cart"],
          status: "open",
          startedAt: at(140),
          resolvedAt: null,
          updates: [
            { at: at(138), author: "K. Osei", body: "Alerting fired: 92% of cart.create requests returning 500. On-call paged." },
            { at: at(110), author: "M. Ferreira", body: "Root cause: failed DB failover left the cart primary read-only. Rolling the failover back now." },
            { at: at(35), author: "M. Ferreira", body: "Rollback complete. 68% of traffic healthy, retry storm still visible. Holding the window before declaring resolved." }
          ]
        },
        {
          id: 2,
          severity: "sev-2",
          title: "Intermittent 5xx on Payments API",
          services: ["svc-pay", "svc-api"],
          status: "monitoring",
          startedAt: at(300),
          resolvedAt: null,
          updates: [
            { at: at(295), author: "K. Osei", body: "Error rate on /v1/payments spiked to 7.4% after the 14:02 deploy. Deploy is held." },
            { at: at(60), author: "T. Alvarez", body: "Error rate back to 0.4% after cache warm-up. Monitoring for 2 more hours before closing." }
          ]
        },
        {
          id: 3,
          severity: "sev-3",
          title: "Email delivery delayed during nightly batch",
          services: ["svc-email", "svc-batch"],
          status: "resolved",
          startedAt: at(2100),
          resolvedAt: at(1700),
          updates: [
            { at: at(2090), author: "T. Alvarez", body: "Queue depth climbing since 02:00; delivery latency up to 40 min." },
            { at: at(1710), author: "K. Osei", body: "Stale SMTP pool reclaimed. Queue draining normally, all mail delivered." }
          ]
        },
        {
          id: 4,
          severity: "sev-4",
          title: "Search latency spike in EU region",
          services: ["svc-search"],
          status: "open",
          startedAt: at(40),
          resolvedAt: null,
          updates: [
            { at: at(30), author: "M. Ferreira", body: "p95 search latency 1.9s in eu-west. Suspect index merge storm after the 23:40 reindex." }
          ]
        }
      ]
    };
  }

  // --- theme ---

  function loadThemePref() {
    var pref = window.localStorage.getItem(THEME_KEY);
    return THEME_PREFS.indexOf(pref) === -1 ? "system" : pref;
  }

  function applyTheme(pref) {
    var theme = pref === "system" ? (themeMq.matches ? "dark" : "light") : pref;
    document.documentElement.setAttribute("data-theme", theme);
  }

  function wireTheme() {
    var pref = loadThemePref();
    applyTheme(pref);
    els.themeSelect.value = pref;
    els.themeSelect.addEventListener("change", function () {
      try {
        window.localStorage.setItem(THEME_KEY, this.value);
      } catch (e) { /* theme is best-effort */ }
      applyTheme(this.value);
      announce("Theme set to " + this.value + ".");
    });
    var onMq = function () { applyTheme(loadThemePref()); };
    if (themeMq.addEventListener) themeMq.addEventListener("change", onMq);
    else themeMq.addListener(onMq);
  }

  // --- rendering ---

  function render() {
    renderSummary();
    renderServices();
    renderIncidents();
    renderNewFormServices();
  }

  function renderSummary() {
    var open = 0, monitoring = 0, resolved = 0;
    var svc = { operational: 0, degraded: 0, "partial-outage": 0, "major-outage": 0 };
    for (var i = 0; i < state.incidents.length; i++) {
      var st = state.incidents[i].status;
      if (st === "open") open++;
      else if (st === "monitoring") monitoring++;
      else resolved++;
    }
    for (var j = 0; j < state.services.length; j++) {
      svc[state.services[j].status]++;
    }
    els.summary.textContent =
      "Incidents: " + open + " open, " + monitoring + " monitoring, " + resolved + " resolved. " +
      "Services: " + svc.operational + " operational, " + svc.degraded + " degraded, " +
      svc["partial-outage"] + " partial outage, " + svc["major-outage"] + " major outage.";
  }

  function renderServices() {
    var ul = els.serviceList;
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    for (var i = 0; i < state.services.length; i++) {
      var svc = state.services[i];
      var li = document.createElement("li");
      var dot = document.createElement("span");
      dot.className = "dot dot-" + svc.status;
      dot.setAttribute("aria-hidden", "true");
      var name = document.createElement("span");
      name.className = "service-name";
      name.textContent = svc.name;
      var st = document.createElement("span");
      st.className = "service-status status-" + svc.status;
      st.textContent = STATUS_LABELS[svc.status] || svc.status;
      li.appendChild(dot);
      li.appendChild(name);
      li.appendChild(st);
      ul.appendChild(li);
    }
  }

  function filteredIncidents() {
    var q = filters.query.toLowerCase();
    var out = [];
    for (var i = 0; i < state.incidents.length; i++) {
      var inc = state.incidents[i];
      if (filters.status && inc.status !== filters.status) continue;
      if (filters.severity && inc.severity !== filters.severity) continue;
      if (q) {
        var hay = inc.title.toLowerCase() + " " + serviceNamesLower(inc);
        if (hay.indexOf(q) === -1) continue;
      }
      out.push(inc);
    }
    out.sort(function (a, b) {
      if (a.startedAt < b.startedAt) return 1;
      if (a.startedAt > b.startedAt) return -1;
      return 0;
    });
    return out;
  }

  function serviceNamesLower(inc) {
    var names = [];
    for (var i = 0; i < inc.services.length; i++) {
      var svc = findService(inc.services[i]);
      if (svc) names.push(svc.name.toLowerCase());
    }
    return names.join(" ");
  }

  function affectedNames(inc) {
    if (!inc.services.length) return "None recorded.";
    var names = [];
    for (var i = 0; i < inc.services.length; i++) {
      var svc = findService(inc.services[i]);
      if (svc) names.push(svc.name);
    }
    return names.length ? names.join(", ") : "None recorded.";
  }

  function latestUpdateText(inc) {
    if (!inc.updates.length) return "No updates yet.";
    var last = inc.updates[inc.updates.length - 1];
    return ageFrom(last.at) + " - " + last.author;
  }

  function renderIncidents() {
    var list = filteredIncidents();
    var ul = els.incidentList;
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    els.emptyNote.hidden = list.length !== 0;
    els.emptyNote.textContent = state.incidents.length === 0
      ? "No incidents yet. Use New incident to create one."
      : "No incidents match the current filters.";
    for (var i = 0; i < list.length; i++) ul.appendChild(buildIncidentItem(list[i]));
  }

  function buildIncidentItem(inc) {
    var li = document.createElement("li");
    var article = document.createElement("article");
    article.className = "incident incident-" + inc.severity;

    var head = document.createElement("header");
    head.className = "incident-head";
    var title = document.createElement("h3");
    title.className = "incident-title";
    title.textContent = inc.title;
    var idEl = document.createElement("span");
    idEl.className = "incident-id";
    idEl.textContent = "INC-" + inc.id;
    var sevBadge = document.createElement("span");
    sevBadge.className = "badge badge-" + inc.severity;
    sevBadge.textContent = SEVERITY_LABELS[inc.severity] || inc.severity;
    var stBadge = document.createElement("span");
    stBadge.className = "badge badge-" + inc.status;
    stBadge.textContent = INCIDENT_STATUS_LABELS[inc.status] || inc.status;
    head.appendChild(title);
    head.appendChild(idEl);
    head.appendChild(sevBadge);
    head.appendChild(stBadge);
    article.appendChild(head);

    var meta = document.createElement("dl");
    meta.className = "incident-meta";
    appendMetaRow(meta, "Started", fmtDate(inc.startedAt));
    appendMetaRow(meta, "Latest update", latestUpdateText(inc));
    appendMetaRow(meta, "Affected", affectedNames(inc));
    article.appendChild(meta);

    var actions = document.createElement("div");
    actions.className = "incident-actions";
    var toggle = document.createElement("button");
    toggle.type = "button";
    var isExpanded = expandedId === inc.id;
    toggle.textContent = isExpanded ? "Hide timeline" : "Show timeline";
    toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    toggle.addEventListener("click", function () {
      expandedId = isExpanded ? null : inc.id;
      render();
    });
    actions.appendChild(toggle);
    if (inc.status === "open") addStatusButton(actions, inc, "Monitor", "open", "monitoring");
    if (inc.status === "open" || inc.status === "monitoring") {
      addStatusButton(actions, inc, "Resolve", inc.status, "resolved");
    }
    if (inc.status !== "open") addStatusButton(actions, inc, "Reopen", inc.status, "open");
    article.appendChild(actions);

    if (isExpanded) article.appendChild(buildTimeline(inc));

    li.appendChild(article);
    return li;
  }

  function appendMetaRow(dl, label, text) {
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    dd.textContent = text;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function addStatusButton(actions, inc, label, from, to) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", function () {
      if (inc.status !== from) return;
      inc.status = to;
      inc.resolvedAt = to === "resolved" ? new Date().toISOString() : null;
      persist();
      render();
      announce("INC-" + inc.id + " marked " + INCIDENT_STATUS_LABELS[to].toLowerCase() + ".");
    });
    actions.appendChild(b);
  }

  function buildTimeline(inc) {
    var tl = document.createElement("section");
    tl.className = "timeline";
    tl.id = "timeline-" + inc.id;

    var h = document.createElement("h3");
    h.textContent = "Incident timeline";
    tl.appendChild(h);

    var ol = document.createElement("ol");
    var updates = inc.updates.slice().sort(function (a, b) {
      if (a.at < b.at) return -1;
      if (a.at > b.at) return 1;
      return 0;
    });
    for (var i = 0; i < updates.length; i++) {
      var u = updates[i];
      var item = document.createElement("li");
      var metaEl = document.createElement("span");
      metaEl.className = "update-meta";
      metaEl.textContent = fmtDate(u.at) + " - " + ageFrom(u.at);
      var auth = document.createElement("span");
      auth.className = "update-author";
      auth.textContent = u.author;
      var body = document.createElement("p");
      body.className = "update-body";
      body.textContent = u.body;
      item.appendChild(metaEl);
      item.appendChild(auth);
      item.appendChild(body);
      ol.appendChild(item);
    }
    tl.appendChild(ol);

    var form = document.createElement("form");
    form.className = "update-form";

    var row = document.createElement("div");
    row.className = "form-row";
    row.appendChild(buildField("Author", buildTextInput("update-author", "Your name")));
    row.appendChild(buildField("Time", buildTimeInput()));
    form.appendChild(row);
    form.appendChild(buildField("Update", buildTextArea("update-body", "What changed?")));

    var submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Add update";
    form.appendChild(submit);

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var author = els["update-author"].value.trim();
      var timeVal = els["update-time"].value;
      var bodyText = els["update-body"].value.trim();
      if (!author) { announce("Update author is required."); return; }
      var ms = Date.parse(timeVal);
      if (timeVal === "" || Number.isNaN(ms)) {
        announce("A valid update time is required.");
        return;
      }
      if (ms > Date.now()) {
        announce("Update time cannot be in the future.");
        return;
      }
      if (!bodyText) { announce("Update text is required."); return; }
      inc.updates.push({
        at: new Date(ms).toISOString(),
        author: author,
        body: bodyText
      });
      persist();
      render();
      announce("Update added to INC-" + inc.id + ".");
    });

    tl.appendChild(form);
    return tl;
  }

  function buildField(labelText, inputEl) {
    var label = document.createElement("label");
    label.className = "field";
    var span = document.createElement("span");
    span.className = "field-label";
    span.textContent = labelText;
    label.appendChild(span);
    label.appendChild(inputEl);
    return label;
  }

  function buildTextInput(id, placeholder) {
    var input = document.createElement("input");
    input.type = "text";
    input.maxLength = 60;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", id);
    els[id] = input;
    return input;
  }

  function buildTimeInput() {
    var input = document.createElement("input");
    input.type = "datetime-local";
    input.value = toLocalInputValue(new Date());
    input.setAttribute("aria-label", "update-time");
    els["update-time"] = input;
    return input;
  }

  function buildTextArea(id, placeholder) {
    var area = document.createElement("textarea");
    area.rows = 2;
    area.maxLength = 2000;
    area.placeholder = placeholder;
    area.setAttribute("aria-label", id);
    els[id] = area;
    return area;
  }

  function renderNewFormServices() {
    var box = els.newServices;
    while (box.firstChild) box.removeChild(box.firstChild);
    for (var i = 0; i < state.services.length; i++) {
      var svc = state.services[i];
      var label = document.createElement("label");
      label.className = "check-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = svc.id;
      var span = document.createElement("span");
      span.textContent = svc.name;
      label.appendChild(cb);
      label.appendChild(span);
      box.appendChild(label);
    }
  }

  // --- new incident form ---

  function hideNewForm() {
    els.newForm.hidden = true;
    els.newTitle.value = "";
    els.newBtn.setAttribute("aria-expanded", "false");
  }

  function wireNewForm() {
    els.newBtn.addEventListener("click", function () {
      if (els.newForm.hidden) {
        els.newStart.value = toLocalInputValue(new Date());
        els.newForm.hidden = false;
        els.newBtn.setAttribute("aria-expanded", "true");
        els.newTitle.focus();
      } else {
        hideNewForm();
      }
    });
    els.cancelNew.addEventListener("click", hideNewForm);
    els.newForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var title = els.newTitle.value.trim();
      var startVal = els.newStart.value;
      if (!title) { announce("Incident title is required."); return; }
      var ms = Date.parse(startVal);
      if (startVal === "" || Number.isNaN(ms)) {
        announce("A valid start time is required.");
        return;
      }
      if (ms > Date.now()) { announce("Start time cannot be in the future."); return; }
      var picked = [];
      var children = els.newServices.children;
      for (var i = 0; i < children.length; i++) {
        var cb = children[i].firstElementChild;
        if (cb && cb.checked) picked.push(cb.value);
      }
      if (!picked.length) { announce("Select at least one affected service."); return; }
      var id = nextIncidentId();
      state.incidents.push({
        id: id,
        severity: els.newSeverity.value,
        title: title,
        services: picked,
        status: "open",
        startedAt: new Date(ms).toISOString(),
        resolvedAt: null,
        updates: []
      });
      persist();
      hideNewForm();
      render();
      announce("INC-" + id + " created.");
    });
  }

  // --- import / export / reset ---

  function wireImport() {
    els.importFile.addEventListener("change", function () {
      var input = this;
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        handleImportText(String(ev.target.result));
      };
      reader.onerror = function () {
        announce("Could not read the selected file. Import failed.");
      };
      reader.readAsText(file);
      input.value = "";
    });
    els.importBtn.addEventListener("click", function () {
      els.importFile.click();
    });
  }

  function handleImportText(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      announce("Import failed: the file is not valid JSON.");
      return;
    }
    if (!isObject(data) || data.app !== "incident-desk") {
      announce("Import failed: expected app 'incident-desk'.");
      return;
    }
    if (data.version !== 1) {
      announce("Import failed: unsupported version " + data.version + ".");
      return;
    }
    var err = validateState(data);
    if (err) {
      announce("Import failed: " + err);
      return;
    }
    state = data;
    persist();
    render();
    announce("Imported " + state.services.length + " services and " + state.incidents.length + " incidents.");
  }

  function wireExport() {
    els.exportBtn.addEventListener("click", function () {
      var payload = {
        app: "incident-desk",
        version: 1,
        exportedAt: new Date().toISOString(),
        services: state.services,
        incidents: state.incidents
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "incident-desk-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      announce("Current data exported to incident-desk-export.json.");
    });
  }

  function wireReset() {
    els.resetBtn.addEventListener("click", function () {
      if (!window.confirm("Replace all current data with the demo dataset? This cannot be undone.")) return;
      state = demoState();
      persist();
      render();
      announce("Demo data loaded.");
    });
  }

  // --- filters ---

  function wireFilters() {
    els.search.addEventListener("input", function () {
      filters.query = this.value;
      render();
    });
    els.statusFilter.addEventListener("change", function () {
      filters.status = this.value;
      render();
    });
    els.severityFilter.addEventListener("change", function () {
      filters.severity = this.value;
      render();
    });
  }

  // --- init ---

  function collectEls() {
    function byId(id) {
      return document.getElementById(id);
    }
    els.summary = byId("summary");
    els.live = byId("live-region");
    els.serviceList = byId("service-list");
    els.incidentList = byId("incident-list");
    els.emptyNote = byId("empty-note");
    els.search = byId("search");
    els.statusFilter = byId("status-filter");
    els.severityFilter = byId("severity-filter");
    els.newBtn = byId("new-incident-btn");
    els.newForm = byId("new-incident-form");
    els.newTitle = byId("new-title");
    els.newSeverity = byId("new-severity");
    els.newStart = byId("new-start");
    els.newServices = byId("new-services");
    els.cancelNew = byId("cancel-new-btn");
    els.themeSelect = byId("theme-select");
    els.exportBtn = byId("export-btn");
    els.importBtn = byId("import-btn");
    els.importFile = byId("import-file");
    els.resetBtn = byId("reset-btn");
  }

  function loadInitial() {
    var stored = loadStored();
    if (stored) {
      var err = validateState(stored);
      if (err) {
        state = demoState();
        announce("Stored data was rejected (" + err + "). Seeded the demo dataset instead.");
      } else {
        state = stored;
      }
    } else {
      state = demoState();
      announce("Loaded the demo dataset.");
    }
    persist();
  }

  function init() {
    collectEls();
    loadInitial();
    wireTheme();
    wireFilters();
    wireNewForm();
    wireImport();
    wireExport();
    wireReset();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
