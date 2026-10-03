/* DSE Physics Daily — renders data/index.json + data/YYYY-MM-DD.json.
 * All untrusted strings are inserted with textContent (never innerHTML),
 * and only http(s) URLs are used for links. */
(function () {
  "use strict";

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  var dates = [];
  var cache = {};
  var current = null;

  function $(id) { return document.getElementById(id); }

  function el(tag, opts, children) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = String(opts.text);
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (k) { node.setAttribute(k, opts.attrs[k]); });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function safeUrl(u) {
    if (typeof u !== "string") return null;
    try {
      var parsed = new URL(u, window.location.href);
      return (parsed.protocol === "https:" || parsed.protocol === "http:") ? parsed.href : null;
    } catch (e) { return null; }
  }

  function link(text, url) {
    var href = safeUrl(url);
    if (!href) return el("span", { text: text });
    return el("a", { text: text, attrs: { href: href, target: "_blank", rel: "noopener noreferrer" } });
  }

  function str(v) { return typeof v === "string" ? v : (v == null ? "" : String(v)); }

  function formatDate(d) {
    var p = d.split("-").map(Number);
    var wd = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    return p[0] + "年" + p[1] + "月" + p[2] + "日（星期" + WEEKDAYS[wd] + "）";
  }

  function fetchJson(path) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(path + " → HTTP " + r.status);
      return r.json();
    });
  }

  function setStatus(msg, isError) {
    var s = $("status");
    s.textContent = msg || "";
    s.hidden = !msg;
    s.classList.toggle("error", !!isError);
  }

  function renderNews(news) {
    var box = $("news");
    box.replaceChildren();
    (Array.isArray(news) ? news : []).forEach(function (item, i) {
      item = item || {};
      var title = el("h3", null, [el("span", { className: "num", text: i + 1 }), el("span", { text: str(item.title) })]);
      var summary = el("p", { className: "summary", text: str(item.summary) });
      var topic = item.topic ? el("div", { className: "topic" }, [el("b", { text: "DSE 課題：" }), document.createTextNode(str(item.topic))]) : null;

      var src = el("div", { className: "source" });
      var srcLabel = "來源 Source：" + str(item.source_name || "link") + (item.source_date ? "（" + str(item.source_date) + "）" : "");
      src.appendChild(item.source_url ? link(srcLabel, item.source_url) : el("span", { text: srcLabel }));
      (Array.isArray(item.links) ? item.links : []).forEach(function (l) {
        if (l && l.url) src.appendChild(link("🔗 " + str(l.label || "Link"), l.url));
      });

      box.appendChild(el("article", { className: "card news-card" }, [title, topic, summary, src]));
    });
  }

  function renderQuestion(q, news) {
    var card = $("questionCard");
    if (!q) { card.hidden = true; return; }
    card.hidden = false;
    var story = str(q.story);
    if (!story && q.based_on && news && news[q.based_on - 1]) story = str(news[q.based_on - 1].title);
    $("qStory").textContent = story ? "根據新聞" + (q.based_on ? " " + q.based_on : "") + "：" + story : "";
    $("qEn").textContent = str(q.question_en);
    $("qZh").textContent = str(q.question_zh);
    $("qAns").textContent = str(q.answer);
    setAnswer(false);
  }

  function setAnswer(show) {
    $("answer").hidden = !show;
    var btn = $("answerBtn");
    btn.setAttribute("aria-expanded", show ? "true" : "false");
    btn.textContent = show ? "隱藏答案 Hide answer" : "顯示答案 Show answer";
  }

  function renderNav() {
    var sel = $("dateSelect");
    sel.replaceChildren();
    dates.forEach(function (d, i) {
      sel.appendChild(el("option", { text: d + (i === 0 ? "（最新）" : ""), attrs: { value: d } }));
    });
    var list = $("archiveList");
    list.replaceChildren();
    dates.forEach(function (d) {
      list.appendChild(el("li", null, [el("a", { text: d, attrs: { href: "#" + d } })]));
    });
  }

  function updateNavState() {
    var i = dates.indexOf(current);
    $("dateSelect").value = current;
    $("prevBtn").disabled = i < 0 || i >= dates.length - 1; // older
    $("nextBtn").disabled = i <= 0;                          // newer
    Array.prototype.forEach.call($("archiveList").querySelectorAll("a"), function (a) {
      if (a.getAttribute("href") === "#" + current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function show(date) {
    if (!DATE_RE.test(date) || dates.indexOf(date) < 0) date = dates[0];
    current = date;
    updateNavState();
    setStatus("載入中… Loading…");
    var p = cache[date] ? Promise.resolve(cache[date]) : fetchJson("data/" + date + ".json");
    p.then(function (day) {
      if (current !== date) return;
      cache[date] = day;
      var title = $("dayTitle");
      title.replaceChildren(document.createTextNode("📅 " + formatDate(date)));
      if (dates[0] === date) title.appendChild(el("small", { text: "最新 Latest" }));
      renderNews(day.news);
      renderQuestion(day.question, day.news);
      $("day").hidden = false;
      setStatus("");
    }).catch(function (err) {
      if (current !== date) return;
      $("day").hidden = true;
      setStatus("載入失敗 Failed to load " + date + ": " + err.message, true);
    });
  }

  function fromHash() {
    var h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    show(h);
  }

  function go(date) {
    if (window.location.hash === "#" + date) show(date);
    else window.location.hash = date;
  }

  function init() {
    $("answerBtn").addEventListener("click", function () { setAnswer($("answer").hidden); });
    $("dateSelect").addEventListener("change", function (e) { go(e.target.value); });
    $("prevBtn").addEventListener("click", function () {
      var i = dates.indexOf(current); if (i < dates.length - 1) go(dates[i + 1]);
    });
    $("nextBtn").addEventListener("click", function () {
      var i = dates.indexOf(current); if (i > 0) go(dates[i - 1]);
    });
    window.addEventListener("hashchange", fromHash);

    fetchJson("data/index.json").then(function (idx) {
      if (idx && !Array.isArray(idx)) idx = idx.dates;
      dates = (Array.isArray(idx) ? idx : []).filter(function (d) { return typeof d === "string" && DATE_RE.test(d); });
      dates = dates.filter(function (d, i) { return dates.indexOf(d) === i; }).sort().reverse();
      if (!dates.length) { setStatus("暫時未有內容 No entries yet."); return; }
      renderNav();
      fromHash();
    }).catch(function (err) {
      setStatus("載入失敗 Failed to load index: " + err.message, true);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
