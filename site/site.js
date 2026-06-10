/* 8genC MCP — shared interactions */
(function () {
  "use strict";

  // ---- Mobile nav toggle ----
  document.addEventListener("click", function (e) {
    var burger = e.target.closest("[data-nav-toggle]");
    if (burger) {
      var nav = burger.closest(".nav");
      if (nav) nav.classList.toggle("is-open");
    }
  });

  // ---- Copy-to-clipboard ----
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-copy]");
    if (!btn) return;
    var sel = btn.getAttribute("data-copy");
    var src = sel ? document.querySelector(sel) : null;
    var text = src ? (src.innerText || src.textContent) : btn.getAttribute("data-copy-text");
    if (!text) return;
    var done = function () {
      var label = btn.querySelector("[data-copy-label]") || btn;
      var prev = label.textContent;
      btn.classList.add("is-copied");
      label.textContent = "Copied";
      setTimeout(function () {
        btn.classList.remove("is-copied");
        label.textContent = prev;
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text.trim()).then(done, done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = text.trim();
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (err) {}
      document.body.removeChild(ta);
      done();
    }
  });

  // ---- Tabs ----
  document.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (!tab) return;
    var group = tab.closest("[data-tabs]");
    if (!group) return;
    var name = tab.getAttribute("data-tab");
    group.querySelectorAll("[data-tab]").forEach(function (t) {
      t.classList.toggle("is-active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    group.querySelectorAll("[data-tab-panel]").forEach(function (p) {
      p.hidden = p.getAttribute("data-tab-panel") !== name;
    });
  });

  // ---- Accordion ----
  document.addEventListener("click", function (e) {
    var head = e.target.closest("[data-acc-head]");
    if (!head) return;
    var item = head.closest("[data-acc-item]");
    if (!item) return;
    var open = item.classList.toggle("is-open");
    var body = item.querySelector("[data-acc-body]");
    if (body) body.hidden = !open;
    head.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // ---- Live status strip (real data from /api/status) ----
  (function () {
    var bar = document.querySelector("[data-statusbar]");
    if (!bar) return;
    var setNum = function (metric, value) {
      var el = bar.querySelector('[data-metric="' + metric + '"] [data-num]');
      if (el && value != null) el.textContent = value;
    };
    var setLbl = function (metric, text) {
      var el = bar.querySelector('[data-metric="' + metric + '"] .metric__lbl');
      if (el && text) el.textContent = text;
    };
    fetch("/api/status", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (s.uptime_pct != null) {
          setNum("uptime", s.uptime_pct);
          var d = s.uptime_window_days || 0;
          setLbl("uptime", d >= 90 ? "90-day uptime" : ("uptime · last " + d + "d"));
        } else {
          setLbl("uptime", "uptime · warming up");
        }
        if (s.latency_ms != null) setNum("latency", s.latency_ms);
        if (s.tools != null) setNum("tools", s.tools);
        if (s.services != null) setNum("services", s.services);
        if (s.status && s.status !== "operational") {
          var chip = bar.querySelector("[data-status-chip]");
          var label = bar.querySelector("[data-status-label]");
          if (chip) { chip.classList.remove("chip--ok"); chip.classList.add("chip--warn"); }
          if (label) label.textContent = "Degraded";
        }
      })
      .catch(function () { /* leave fallbacks */ });
  })();

  // ---- Reveal on scroll ----
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll("[data-reveal]").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll("[data-reveal]").forEach(function (el) { el.classList.add("is-in"); });
  }
})();
