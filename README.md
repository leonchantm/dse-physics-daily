# 每日物理新聞 Daily Physics News

A small static website for HKDSE Physics students: each day lists a few recent physics news
stories (summarised in Cantonese, tagged with the relevant DSE topic and source), plus one
DSE-style question with the suggested answer hidden behind a **顯示答案 Show answer** button.

Live site: https://leonchantm.github.io/dse-physics-daily/

No build step — plain HTML/CSS/JS served by GitHub Pages from the `main` branch root.

## Structure

```
index.html            page shell
assets/style.css      styles (mobile-first, light/dark)
assets/app.js         loads data/*.json and renders it (textContent only, http(s) links only)
data/index.json       list of available dates, newest first, e.g. ["2026-10-04", "2026-10-03"]
data/YYYY-MM-DD.json  one file per day
scripts/add_day.py    validate a day file, copy into data/, update data/index.json
.nojekyll             serve files as-is (no Jekyll processing)
```

Deep links: `https://leonchantm.github.io/dse-physics-daily/#2026-10-03`

## Day file format

```json
{
  "date": "2026-10-03",
  "news": [
    {
      "title": "標題",
      "summary": "廣東話摘要……",
      "topic": "電和磁（磁場）、電磁波",
      "source_name": "The Daily Galaxy",
      "source_url": "https://…",
      "source_date": "2/10",
      "links": [{ "label": "arXiv paper", "url": "https://…" }]
    }
  ],
  "question": {
    "based_on": 2,
    "story": "所根據嘅新聞標題",
    "question_en": "Stem…\n$$…$$\n(a) … (3 marks)\nGiven:\n- $…$\n(b) … (3 marks)",
    "question_zh": "題幹……\n$$…$$\n(a) ……（3 分）\n已知：\n- $…$\n(b) ……（3 分）",
    "answer_en": "(a)\n- step … (1M)\n- result … (1A)\n(b)\n- point … (1)",
    "answer_zh": "(a)\n- 步驟……（1M）\n- 答案……（1A）\n(b)\n- 要點……（1）"
  }
}
```

`source_date`, `links` and `based_on` are optional. `question_en`, `question_zh`, `answer_en` and
`answer_zh` are all required (the old single `answer` field is rejected by `add_day.py`; the page
still displays it for both languages if an old file has it).

The question box shows English by default; the 中文 / English button switches both question and
answer, and the choice is remembered in the browser (localStorage).

### Question / answer authoring format

`question_*` and `answer_*` are plain text (never HTML). The page builds the layout from the
line structure and renders math with [KaTeX](https://katex.org/) (`trust: false`). If KaTeX
can't load, the math shows as plain LaTeX source.

| Write | Shows as |
|---|---|
| one line per item, blank line = new paragraph | separate paragraphs |
| `(a) …`, `(b) …` at line start | sub-part with a hanging label; `(i)`, `(ii)` = nested |
| `- …` | list item (use for "Given" data and for each marking step) |
| trailing `(3 marks)`, `（3 分）`, `(1M)`, `(1A)`, `(1)` | right-aligned mark badge |
| `$…$` | inline math |
| `$$…$$` on its own line | centred display equation (scrolls sideways on small screens) |
| `\$` | literal dollar sign |

Rules: keep Chinese text outside `$…$`. Use `\mathrm{}` for units and element symbols. Write
nuclides as `{}^{A}_{Z}\mathrm{X}`. Use `\Delta`, `\times`, `\approx`, `10^{-12}`.

Example `question_en` (with real line breaks):

```text
China's BEST tokamak aims to demonstrate the fusion reaction:
$${}^{2}_{1}\mathrm{H} + {}^{3}_{1}\mathrm{H} \rightarrow {}^{4}_{2}\mathrm{He} + {}^{1}_{0}\mathrm{n}$$
(a) Calculate the energy released in one reaction, in MeV. (3 marks)
Given:
- $m({}^{2}\mathrm{H}) = 2.014102\ \mathrm{u}$
- $1\ \mathrm{u} = 931\ \mathrm{MeV}$
(b) Explain why the fuel must be heated to about 100 million °C … (3 marks)
```

Example `answer_en`:

```text
(a)
- Mass defect $\Delta m = 5.030151 - 5.011268 = 0.018883\ \mathrm{u}$ (1M)
- $E = 0.018883 \times 931 \approx 17.6\ \mathrm{MeV}$ (1A)
(b)
- Both nuclei are positively charged, so they repel strongly. (1)
```

In the JSON file, line breaks are `\n` and every backslash is doubled, for example
`"- $E \\approx 17.6\\ \\mathrm{MeV}$ (1A)\n(b)"`. `add_day.py` rejects unbalanced `$`/`$$`
or braces. It warns (but doesn't fail) about Chinese inside math or answers without mark badges.
See `data/2026-10-03.json` for a full example.

## Adding a new day

Recommended (validates, dedupes and sorts the index for you):

```bash
python3 scripts/add_day.py /path/to/2026-10-04.json   # copies to data/2026-10-04.json, updates data/index.json
python3 scripts/add_day.py --check                     # optional: validate everything
git add data/
git commit -m "Add 2026-10-04"
git push origin main
```

Re-running for the same date overwrites that day (use `--no-overwrite` to refuse instead).
The script exits non-zero and writes nothing if the file is invalid.

Manual alternative: create `data/YYYY-MM-DD.json` and add the date to the **front** of the
array in `data/index.json`.

GitHub Pages usually updates within a minute or two of the push.

## Caching notes

GitHub Pages sends `Cache-Control: max-age=600`. To avoid a stale mix of old and new files:

- `index.html` loads `assets/style.css?v=…` and `assets/app.js?v=…`. **When you change CSS/JS,
  bump the `v=` value in `index.html`** (daily data updates don't need this).
- Data files are fetched with `cache: "no-cache"` plus a per-minute `?t=` query, so a new day
  appears as soon as Pages has deployed it.
- `app.js` rebuilds the question box if any expected element is missing, and renders the title,
  news and question independently, so one missing element can't break the whole page.

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000/
```
(Opening `index.html` directly from disk won't work because browsers block `fetch` on `file://`.)
