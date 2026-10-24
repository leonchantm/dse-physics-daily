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
  var LANG_KEY = "dsePhysicsDaily.lang";
  var lang = "en";
  var currentQ = null;
  var view = "day";
  var calYear = 0;
  var calMonth = 0;
  var RECENT_LIMIT = 7;
  var MORE_HASH = "more";
  var currentTopic = null;
  var topicsReady = false;
  var topicBuckets = {};
  /* Question of the Day topics. A question uses question.topic when that
   * names one of these. Otherwise a photon / photons / 光子 mention in the
   * question, its story, or the based-on news topic or title is Atomic
   * Physics (photonics, as in a journal or a photonic chip, does not count).
   * Else the first of these labels in the topic string of news[based_on]
   * wins (天文學 is skipped). */
  var TOPICS = [
    { id: "heat", en: "Heat and Gases", zh: "熱和氣體",
      keys: ["熱和氣體", "熱力學", "比熱容", "理想氣體", "specific heat", "ideal gas"] },
    { id: "mechanics", en: "Mechanics", zh: "力和運動",
      keys: ["力和運動", "力學", "萬有引力", "circular motion", "momentum"] },
    { id: "waves", en: "Waves and Optics", zh: "波動",
      keys: ["波動", "光學", "電磁波", "折射", "干涉", "衍射", "electromagnetic", "wavelength", "refraction", "interference", "diffraction"] },
    { id: "electricity", en: "Electricity and Magnetism", zh: "電和磁",
      keys: ["電和磁", "家居用電", "電路", "磁場", "電動勢", "magnetic field", "electric field", "electricity"] },
    { id: "radioactivity", en: "Radioactivity", zh: "放射現象和核能",
      keys: ["放射現象和核能", "放射現象", "放射性", "核能", "核聚變", "核裂變", "核電站", "核反應", "radioactivity", "nuclear", "fusion", "fission"] },
    { id: "atomic", en: "Atomic Physics", zh: "原子世界",
      keys: ["原子世界", "原子物理", "原子光譜", "線光譜", "能隙", "能級", "能階", "能帶", "價帶", "導帶", "光電效應", "逸出功", "光子", "玻爾模型", "波爾模型", "band gap", "band-gap", "energy level", "energy levels", "photoelectric", "work function", "photon", "photons", "bohr", "atomic spectra", "atomic spectrum", "line spectrum", "conduction band", "valence band"] }
  ];
  var TOPIC_BY_ID = {};
  TOPICS.forEach(function (t) { TOPIC_BY_ID[t.id] = t; });
  var TOPIC_ALIASES = {
    "heat": "heat", "heat and gases": "heat", "熱和氣體": "heat",
    "mechanics": "mechanics", "力和運動": "mechanics", "力學": "mechanics",
    "waves": "waves", "waves and optics": "waves", "波動": "waves", "光學": "waves",
    "electricity": "electricity", "electricity and magnetism": "electricity", "電和磁": "electricity",
    "radioactivity": "radioactivity", "放射現象和核能": "radioactivity", "放射性": "radioactivity",
    "atomic": "atomic", "atomic physics": "atomic", "atomic world": "atomic", "原子世界": "atomic", "原子物理": "atomic",
    "other": "other", "其他": "other"
  };

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

  /* ---------- Rich text for questions/answers ----------
   * Authoring format (plain text, never HTML):
   *   blank line           -> paragraph break
   *   (a) … / (b) …        -> sub-part; (i) (ii) … -> nested sub-part
   *   - item               -> list item
   *   trailing (3 marks) / （3 分） / (1M) / (1A) / (1) -> mark badge, right-aligned
   *   $$ … $$ on own line  -> display equation (may span lines)
   *   $ … $                -> inline math;  \$ -> literal dollar
   * Text is inserted with textContent; only math segments go to KaTeX (trust:false). */
  var PART_RE = /^[（(]([a-h]|i{1,3}|iv|vi{0,3}|ix|x)[)）]\s*(.*)$/;
  var ROMAN_RE = /^(i{1,3}|iv|vi{0,3}|ix|x)$/;
  var ITEM_RE = /^[-•]\s+(.*)$/;
  var MARK_RE = /\s*[（(]\s*(\d+\s*(?:marks?|分)|\d*\s*[MA]|\d+)\s*[)）]\s*$/i;

  function renderMath(tex, display) {
    var node = el(display ? "div" : "span", { className: display ? "math-display" : "math-inline" });
    if (window.katex && typeof window.katex.render === "function") {
      try {
        window.katex.render(tex, node, { displayMode: !!display, throwOnError: false, trust: false, strict: "ignore", output: "htmlAndMathml" });
        return node;
      } catch (e) { /* fall through to plain text */ }
    }
    node.classList.add("math-fallback");
    node.textContent = tex;
    return node;
  }

  function appendInline(parent, text) {
    var buf = "", i = 0, n = text.length;
    function flush() { if (buf) { parent.appendChild(document.createTextNode(buf)); buf = ""; } }
    while (i < n) {
      var c = text.charAt(i);
      if (c === "\\" && text.charAt(i + 1) === "$") { buf += "$"; i += 2; continue; }
      if (c === "$") {
        var j = i + 1;
        while (j < n && !(text.charAt(j) === "$" && text.charAt(j - 1) !== "\\")) j++;
        if (j < n && j > i + 1) {
          flush();
          parent.appendChild(renderMath(text.slice(i + 1, j), false));
          i = j + 1;
          continue;
        }
      }
      buf += c; i++;
    }
    flush();
    return parent;
  }

  function lineWithMark(tag, className, text) {
    var node = el(tag, { className: className });
    var m = text.match(MARK_RE);
    var body = m ? text.slice(0, m.index) : text;
    node.appendChild(appendInline(el("span", { className: "q-line-text" }), body));
    if (m) node.appendChild(el("span", { className: "q-mark", text: m[1].replace(/\s+/g, " ") }));
    return node;
  }

  function renderRich(container, text) {
    container.replaceChildren();
    var lines = str(text).replace(/\r\n?/g, "\n").split("\n");
    var root = container, cur = root, part1 = null, list = null, mathBuf = null;
    lines.forEach(function (raw) {
      var t = raw.trim();
      if (mathBuf !== null) {
        var end = t.indexOf("$$");
        if (end < 0) { mathBuf.push(t); return; }
        mathBuf.push(t.slice(0, end));
        cur.appendChild(renderMath(mathBuf.join("\n"), true));
        mathBuf = null;
        return;
      }
      if (!t) { list = null; return; }
      if (t.indexOf("$$") === 0) {
        list = null;
        var rest = t.slice(2), close = rest.indexOf("$$");
        if (close >= 0) cur.appendChild(renderMath(rest.slice(0, close), true));
        else mathBuf = [rest];
        return;
      }
      var pm = t.match(PART_RE);
      if (pm) {
        list = null;
        var nested = ROMAN_RE.test(pm[1]) && part1;
        var part = el("div", { className: "q-part" + (nested ? " q-part-sub" : "") });
        part.appendChild(el("span", { className: "q-part-label", text: "(" + pm[1] + ")" }));
        var body = el("div", { className: "q-part-body" });
        if (pm[2]) body.appendChild(lineWithMark("p", "q-line", pm[2]));
        part.appendChild(body);
        if (nested) { part1.appendChild(part); }
        else { root.appendChild(part); part1 = body; }
        cur = body;
        return;
      }
      var im = t.match(ITEM_RE);
      if (im) {
        if (!list) { list = el("ul", { className: "q-list" }); cur.appendChild(list); }
        list.appendChild(el("li", null, [lineWithMark("div", "q-line", im[1])]));
        return;
      }
      list = null;
      cur.appendChild(lineWithMark("p", "q-line", t));
    });
    if (mathBuf !== null) cur.appendChild(renderMath(mathBuf.join("\n"), true));
    return container;
  }

  function formatDate(d) {
    var p = d.split("-").map(Number);
    var wd = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    return p[0] + "年" + p[1] + "月" + p[2] + "日（星期" + WEEKDAYS[wd] + "）";
  }

  function fetchJson(path) {
    // no-cache + a per-minute query string so new daily data shows up promptly
    var url = path + (path.indexOf("?") < 0 ? "?" : "&") + "t=" + Math.floor(Date.now() / 60000);
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(path + " → HTTP " + r.status);
      return r.json();
    });
  }

  function setStatus(msg, isError) {
    var s = $("status");
    if (!s) return;
    s.textContent = msg || "";
    s.hidden = !msg;
    s.classList.toggle("error", !!isError);
  }

  function renderNews(news) {
    var box = $("news");
    if (!box) return;
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

  /* Make sure the question box has every element this script needs.
   * If the page HTML is an older/different version (e.g. a stale cached index.html),
   * (re)build the box contents instead of throwing. */
  var Q_IDS = ["qStory", "qLangLabel", "langBtn", "qText", "answerBtn", "answer", "answerTitle", "qAns"];
  function ensureQuestionDom() {
    var card = $("questionCard");
    if (!card) {
      var day = $("day") || $("main") || document.body;
      card = el("section", { className: "question card", attrs: { id: "questionCard", "aria-labelledby": "qHeading" } });
      day.appendChild(card);
    }
    var missing = Q_IDS.some(function (id) { return !$(id) || !card.contains($(id)); });
    if (!missing) return card;
    Q_IDS.concat(["qHeading", "qEn", "qZh"]).forEach(function (id) {
      var old = $(id); if (old && !card.contains(old) && old.parentNode) old.parentNode.removeChild(old);
    });
    card.replaceChildren(
      el("h3", { text: "📝 每日一題 Question of the Day", attrs: { id: "qHeading" } }),
      el("p", { className: "q-story", attrs: { id: "qStory" } }),
      el("div", { className: "q-toolbar" }, [
        el("span", { className: "q-lang-label", text: "English", attrs: { id: "qLangLabel" } }),
        el("button", { className: "lang-btn", text: "中文", attrs: { type: "button", id: "langBtn" } })
      ]),
      el("div", { className: "q-text", attrs: { id: "qText", lang: "en" } }),
      el("button", { className: "answer-btn", text: "Show answer", attrs: { type: "button", id: "answerBtn", "aria-expanded": "false", "aria-controls": "answer" } }),
      el("div", { className: "answer", attrs: { id: "answer", hidden: "" } }, [
        el("h4", { text: "Suggested answer", attrs: { id: "answerTitle" } }),
        el("div", { className: "q-text", attrs: { id: "qAns", lang: "en" } })
      ])
    );
    return card;
  }

  function setText(id, text) { var n = $(id); if (n) n.textContent = text; return n; }

  function renderQuestion(q, news) {
    var card = ensureQuestionDom();
    if (!q) { card.hidden = true; return; }
    card.hidden = false;
    var story = str(q.story);
    if (!story && q.based_on && news && news[q.based_on - 1]) story = str(news[q.based_on - 1].title);
    setText("qStory", story ? "根據新聞" + (q.based_on ? " " + q.based_on : "") + "：" + story : "");
    currentQ = q;
    renderLang();
    setAnswer(false);
  }

  function loadLang() {
    try { return localStorage.getItem(LANG_KEY) === "zh" ? "zh" : "en"; } catch (e) { return "en"; }
  }

  function renderLang() {
    var q = currentQ || {};
    var zh = lang === "zh";
    var langAttr = zh ? "zh-Hant-HK" : "en";
    var qText = $("qText"), qAns = $("qAns");
    if (qText) safely("question text", function () { renderRich(qText, zh ? (q.question_zh || q.question_en) : (q.question_en || q.question_zh)); });
    if (qAns) safely("answer text", function () { renderRich(qAns, zh ? (q.answer_zh || q.answer || q.answer_en) : (q.answer_en || q.answer || q.answer_zh)); });
    if (qText) qText.setAttribute("lang", langAttr);
    if (qAns) qAns.setAttribute("lang", langAttr);
    setText("qLangLabel", zh ? "中文" : "English");
    var btn = setText("langBtn", zh ? "English" : "中文");
    if (btn) btn.setAttribute("aria-label", zh ? "Switch to English 轉做英文" : "Switch to Chinese 轉做中文");
    setText("answerTitle", zh ? "參考答案" : "Suggested answer");
    var ans = $("answer");
    setAnswer(ans ? !ans.hidden : false);
  }

  function setAnswer(show) {
    var ans = $("answer");
    if (ans) ans.hidden = !show;
    var btn = $("answerBtn");
    if (!btn) return;
    btn.setAttribute("aria-expanded", show ? "true" : "false");
    var zh = lang === "zh";
    btn.textContent = show ? (zh ? "隱藏答案" : "Hide answer") : (zh ? "顯示答案" : "Show answer");
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function weekdayIndex(d) {
    var p = d.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }

  function monthOf(d) {
    var p = d.split("-").map(Number);
    return { y: p[0], m: p[1] };
  }

  function monthKey(y, m) { return y * 12 + (m - 1); }

  function publishedBounds() {
    if (!dates.length) return null;
    return { earliest: monthOf(dates[dates.length - 1]), latest: monthOf(dates[0]) };
  }

  function monthInRange(y, m) {
    var b = publishedBounds();
    if (!b) return false;
    var k = monthKey(y, m);
    return k >= monthKey(b.earliest.y, b.earliest.m) && k <= monthKey(b.latest.y, b.latest.m);
  }

  function adjacentMonth(y, m, delta) {
    var nm = m + delta;
    var ny = y;
    if (nm < 1) { nm = 12; ny -= 1; }
    if (nm > 12) { nm = 1; ny += 1; }
    return { y: ny, m: nm };
  }

  function shiftMonth(delta) {
    var next = adjacentMonth(calYear, calMonth, delta);
    if (!monthInRange(next.y, next.m)) return;
    calYear = next.y;
    calMonth = next.m;
    renderCalendar();
  }

  function todayISO() {
    var n = new Date();
    return n.getFullYear() + "-" + pad2(n.getMonth() + 1) + "-" + pad2(n.getDate());
  }

  function aliasId(text) {
    var t = str(text).trim();
    if (!t) return null;
    if (TOPIC_ALIASES[t]) return TOPIC_ALIASES[t];
    var lower = t.toLowerCase();
    return TOPIC_ALIASES[lower] || null;
  }

  /* Whole word only, so "photonics" is not a photon. */
  var PHOTON_RE = /(^|[^a-z])photons?(?![a-z])/i;
  function mentionsPhoton(text) {
    var s = str(text);
    return s.indexOf("光子") >= 0 || PHOTON_RE.test(s);
  }

  function indexOfKey(low, key) {
    var k = String(key).toLowerCase();
    /* "photon" is a prefix of "photonics"; only a whole word counts. */
    if (k === "photon" || k === "photons") {
      var re = new RegExp("(^|[^a-z])" + k + "(?![a-z])", "i");
      var m = re.exec(low);
      return m ? m.index + m[1].length : -1;
    }
    return low.indexOf(k);
  }

  function matchTopic(text) {
    var low = str(text).toLowerCase();
    var best = null;
    TOPICS.forEach(function (topic) {
      topic.keys.forEach(function (key) {
        var i = indexOfKey(low, key);
        if (i < 0) return;
        if (!best || i < best.index || (i === best.index && key.length > best.len)) {
          best = { id: topic.id, index: i, len: key.length };
        }
      });
    });
    return best ? best.id : null;
  }

  function classifyDay(day) {
    day = day || {};
    var q = day.question || {};
    var explicit = aliasId(q.topic);
    if (explicit && explicit !== "other") return explicit;
    var news = Array.isArray(day.news) ? day.news : [];
    var primaryItem = (typeof q.based_on === "number") ? news[q.based_on - 1] : null;
    var primary = primaryItem && primaryItem.topic ? str(primaryItem.topic) : "";
    var photonSource = [q.story, q.question_en, q.question_zh, primary, primaryItem && primaryItem.title].map(str).join("\n");
    if (mentionsPhoton(photonSource)) return "atomic";
    var hit = primary ? matchTopic(primary) : null;
    if (hit) return hit;
    var rest = news.map(function (n) { return n && n.topic ? str(n.topic) : ""; }).join("\n");
    rest += "\n" + [q.story, q.question_en, q.question_zh].map(str).join("\n");
    return matchTopic(rest) || "other";
  }

  function previewText(day) {
    var q = (day && day.question) || {};
    var story = str(q.story).trim();
    if (story) return story;
    var news = Array.isArray(day.news) ? day.news : [];
    if (typeof q.based_on === "number" && news[q.based_on - 1]) {
      var title = str(news[q.based_on - 1].title).trim();
      if (title) return title;
    }
    var raw = str(q.question_en || q.question_zh);
    var lines = raw.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    return lines.length ? lines[0].replace(/\$+/g, "").trim() : "";
  }

  function buildTopicIndex() {
    topicBuckets = { heat: [], mechanics: [], waves: [], electricity: [], radioactivity: [], atomic: [], other: [] };
    dates.forEach(function (d) {
      var day = cache[d];
      if (!day) return;
      var id = classifyDay(day);
      if (!topicBuckets[id]) topicBuckets[id] = [];
      topicBuckets[id].push({ date: d, preview: previewText(day) });
    });
  }

  function topicInfo(id) {
    if (TOPIC_BY_ID[id]) return TOPIC_BY_ID[id];
    if (id === "other") return { id: "other", en: "Other", zh: "其他" };
    return null;
  }

  function topicIdFromHash(h) {
    var m = /^qotd\/([A-Za-z0-9-]+)$/.exec(h);
    if (!m) return "";
    var slug = m[1].toLowerCase();
    if (topicInfo(slug)) return slug;
    var alias = aliasId(m[1]);
    return alias && topicInfo(alias) ? alias : "";
  }

  function renderQotdMenu() {
    var list = $("qotdMenu");
    if (!list) return;
    list.replaceChildren();
    var items = TOPICS.slice();
    if (topicsReady && topicBuckets.other && topicBuckets.other.length) {
      items.push(topicInfo("other"));
    }
    items.forEach(function (topic) {
      var count = topicsReady && topicBuckets[topic.id] ? topicBuckets[topic.id].length : null;
      var sub = topic.zh + (count == null ? "" : " · " + count);
      list.appendChild(el("li", null, [
        el("a", { attrs: { href: "#qotd/" + topic.id } }, [
          el("span", { className: "menu-date", text: topic.en }),
          el("span", { className: "menu-sub", text: sub })
        ])
      ]));
    });
  }

  function renderTopicList() {
    var topic = topicInfo(currentTopic);
    var heading = $("topicHeading");
    var intro = $("topicIntro");
    var list = $("topicList");
    if (!topic) {
      if (heading) heading.textContent = "Question of the Day";
      if (list) list.replaceChildren();
      setStatus("未有呢個課題。Unknown topic.", true);
      return;
    }
    if (heading) {
      heading.replaceChildren(document.createTextNode(topic.en + " "), el("small", { text: topic.zh }));
    }
    if (intro) {
      intro.textContent = "按每日一題所根據新聞嘅主要課題分類。Grouped by the question’s main DSE topic.";
    }
    if (!list) return;
    list.replaceChildren();
    var rows = topicBuckets[topic.id] || [];
    if (!rows.length) {
      list.appendChild(el("li", { className: "topic-empty", text: "呢個課題暫時未有題目。No questions in this topic yet." }));
      return;
    }
    rows.forEach(function (row) {
      list.appendChild(el("li", null, [
        el("a", { attrs: { href: "#" + row.date } }, [
          el("span", { className: "topic-item-date", text: formatDate(row.date) }),
          el("span", { className: "topic-item-preview", text: row.preview || "每日一題" })
        ])
      ]));
    });
    setStatus("");
  }

  function showTopic(id) {
    currentTopic = id;
    view = "topic";
    if ($("day")) $("day").hidden = true;
    if ($("calendarPanel")) $("calendarPanel").hidden = true;
    if ($("topicPanel")) $("topicPanel").hidden = false;
    updateMenuState();
    var topic = topicInfo(id);
    if (!topic) {
      var heading = $("topicHeading");
      if (heading) heading.textContent = "Question of the Day";
      if ($("topicList")) $("topicList").replaceChildren();
      setStatus("未有呢個課題。Unknown topic.", true);
      return;
    }
    if (!topicsReady) {
      var loadingHeading = $("topicHeading");
      if (loadingHeading) {
        loadingHeading.replaceChildren(document.createTextNode(topic.en + " "), el("small", { text: topic.zh }));
      }
      if ($("topicList")) $("topicList").replaceChildren();
      setStatus("載入中… Loading…");
      return;
    }
    renderTopicList();
  }

  function loadTopics() {
    return Promise.all(dates.map(function (d) {
      if (cache[d]) return Promise.resolve(cache[d]);
      return fetchJson("data/" + d + ".json").then(function (day) {
        cache[d] = day;
        return day;
      }).catch(function () { return null; });
    })).then(function () {
      buildTopicIndex();
      topicsReady = true;
      renderQotdMenu();
      updateMenuState();
      if (view === "topic") showTopic(currentTopic);
    }).catch(function (err) {
      if (view === "topic") setStatus("載入失敗 Failed to load questions: " + err.message, true);
    });
  }

  function renderMenu() {
    var list = $("dayMenu");
    if (!list) return;
    list.replaceChildren();
    var latestYear = dates.length ? Number(String(dates[0]).slice(0, 4)) : 0;
    dates.slice(0, RECENT_LIMIT).forEach(function (d, i) {
      var p = d.split("-").map(Number);
      var label = p[1] + "月" + p[2] + "日";
      if (p[0] !== latestYear) label = p[0] + "年" + label;
      var sub = "星期" + WEEKDAYS[weekdayIndex(d)] + (i === 0 ? " · 最新" : "");
      var a = el("a", { attrs: { href: "#" + d } }, [
        el("span", { className: "menu-date", text: label }),
        el("span", { className: "menu-sub", text: sub })
      ]);
      list.appendChild(el("li", null, [a]));
    });
    list.appendChild(el("li", { className: "menu-more" }, [
      el("a", { className: "more-link", attrs: { href: "#" + MORE_HASH } }, [
        el("span", { className: "menu-date", text: "更多新聞" }),
        el("span", { className: "menu-sub", text: "More news" })
      ])
    ]));
  }

  function updateMenuState() {
    var nodes = document.querySelectorAll("#dayMenu a, #qotdMenu a");
    Array.prototype.forEach.call(nodes, function (a) {
      var href = a.getAttribute("href") || "";
      var active = false;
      if (view === "calendar") active = href === "#" + MORE_HASH;
      else if (view === "topic") active = href === "#qotd/" + currentTopic;
      else active = href === "#" + current;
      if (active) {
        a.setAttribute("aria-current", "page");
        if (a.scrollIntoView) a.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else a.removeAttribute("aria-current");
    });
  }

  function renderCalendar() {
    var grid = $("calGrid");
    var title = $("calTitle");
    if (!grid || !title || !calYear) return;
    var monthLabel = calYear + "年" + calMonth + "月";
    title.textContent = monthLabel;
    grid.replaceChildren();

    var header = el("div", { className: "cal-row cal-weekdays", attrs: { role: "row" } });
    WEEKDAYS.forEach(function (w) {
      header.appendChild(el("div", { className: "cal-wd", text: w, attrs: { role: "columnheader" } }));
    });
    grid.appendChild(header);

    var firstWd = new Date(Date.UTC(calYear, calMonth - 1, 1)).getUTCDay();
    var dim = new Date(Date.UTC(calYear, calMonth, 0)).getUTCDate();
    var cells = [];
    var i;
    for (i = 0; i < firstWd; i++) cells.push(0);
    for (i = 1; i <= dim; i++) cells.push(i);
    while (cells.length % 7) cells.push(0);

    var today = todayISO();
    var lookup = {};
    dates.forEach(function (d) { lookup[d] = true; });

    for (var r = 0; r < cells.length; r += 7) {
      var row = el("div", { className: "cal-row", attrs: { role: "row" } });
      for (var c = 0; c < 7; c++) {
        var dayNum = cells[r + c];
        if (!dayNum) {
          row.appendChild(el("div", { className: "cal-day is-pad", attrs: { role: "gridcell" } }));
          continue;
        }
        var iso = calYear + "-" + pad2(calMonth) + "-" + pad2(dayNum);
        var has = !!lookup[iso];
        var cls = "cal-day" + (has ? " has" : " is-disabled") + (iso === today ? " is-today" : "");
        if (has) {
          row.appendChild(el("a", {
            className: cls,
            text: String(dayNum),
            attrs: { href: "#" + iso, role: "gridcell", "aria-label": formatDate(iso) }
          }));
        } else {
          row.appendChild(el("span", {
            className: cls,
            text: String(dayNum),
            attrs: { role: "gridcell", "aria-disabled": "true", "aria-label": formatDate(iso) + "，未有內容" }
          }));
        }
      }
      grid.appendChild(row);
    }

    var prev = $("calPrev");
    var next = $("calNext");
    var prevM = adjacentMonth(calYear, calMonth, -1);
    var nextM = adjacentMonth(calYear, calMonth, 1);
    if (prev) prev.disabled = !monthInRange(prevM.y, prevM.m);
    if (next) next.disabled = !monthInRange(nextM.y, nextM.m);
  }

  function showCalendar() {
    view = "calendar";
    var anchor = (current && dates.indexOf(current) >= 0) ? current : dates[0];
    if (anchor) {
      var mo = monthOf(anchor);
      calYear = mo.y;
      calMonth = mo.m;
    }
    if ($("day")) $("day").hidden = true;
    if ($("calendarPanel")) $("calendarPanel").hidden = false;
    if ($("topicPanel")) $("topicPanel").hidden = true;
    setStatus("");
    renderCalendar();
    updateMenuState();
  }

  function show(date) {
    var fromTopic = view === "topic";
    if (!DATE_RE.test(date) || dates.indexOf(date) < 0) date = dates[0];
    if (!date) { setStatus("暫時未有內容 No entries yet."); return; }
    current = date;
    view = "day";
    if ($("calendarPanel")) $("calendarPanel").hidden = true;
    if ($("topicPanel")) $("topicPanel").hidden = true;
    updateMenuState();
    setStatus(cache[date] ? "" : "載入中… Loading…");
    var p = cache[date] ? Promise.resolve(cache[date]) : fetchJson("data/" + date + ".json");
    p.then(function (day) {
      if (current !== date || view !== "day") return;
      cache[date] = day;
      safely("title", function () {
        var title = $("dayTitle");
        if (!title) return;
        title.replaceChildren(document.createTextNode("📅 " + formatDate(date)));
        if (dates[0] === date) title.appendChild(el("small", { text: "最新 Latest" }));
      });
      safely("news", function () { renderNews(day.news); });
      safely("question", function () { renderQuestion(day.question, day.news); });
      if ($("day")) $("day").hidden = false;
      setStatus("");
      if (fromTopic && $("questionCard") && !$("questionCard").hidden && $("questionCard").scrollIntoView) {
        $("questionCard").scrollIntoView({ block: "start" });
      }
    }).catch(function (err) {
      if (current !== date || view !== "day") return;
      if ($("day")) $("day").hidden = true;
      setStatus("載入失敗 Failed to load " + date + ": " + err.message, true);
    });
  }

  // Run one rendering step; a problem in one section must not break the rest of the page.
  function safely(name, fn) {
    try { fn(); } catch (e) { if (window.console) console.warn("[dse-physics-daily] could not render " + name + ":", e); }
  }

  function fromHash() {
    var h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (h === MORE_HASH) { showCalendar(); return; }
    if (h.indexOf("qotd/") === 0) { showTopic(topicIdFromHash(h)); return; }
    if (!h && dates[0] && window.history && window.history.replaceState) {
      window.history.replaceState(null, "", "#" + dates[0]);
    }
    show(h);
  }

  function init() {
    lang = loadLang();
    // Delegated listeners: keep working even if the question box is rebuilt.
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      if (t.closest("#langBtn")) {
        lang = lang === "zh" ? "en" : "zh";
        try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* ignore */ }
        renderLang();
      } else if (t.closest("#answerBtn")) {
        var ans = $("answer");
        setAnswer(ans ? ans.hidden : true);
      } else if (t.closest("#calPrev")) {
        shiftMonth(-1);
      } else if (t.closest("#calNext")) {
        shiftMonth(1);
      }
    });
    window.addEventListener("hashchange", fromHash);

    fetchJson("data/index.json").then(function (idx) {
      if (idx && !Array.isArray(idx)) idx = idx.dates;
      dates = (Array.isArray(idx) ? idx : []).filter(function (d) { return typeof d === "string" && DATE_RE.test(d); });
      dates = dates.filter(function (d, i) { return dates.indexOf(d) === i; }).sort().reverse();
      if (!dates.length) { setStatus("暫時未有內容 No entries yet."); return; }
      renderMenu();
      renderQotdMenu();
      fromHash();
      loadTopics();
    }).catch(function (err) {
      setStatus("載入失敗 Failed to load index: " + err.message, true);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
