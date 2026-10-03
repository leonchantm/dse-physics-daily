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
    "question_en": "English question…\n(a) … (3 marks)\n(b) … (3 marks)",
    "question_zh": "中文題目……\n(a) ……（3 分）\n(b) ……（3 分）",
    "answer_en": "(a) …\n(b) …",
    "answer_zh": "(a) ……\n(b) ……"
  }
}
```

`source_date`, `links` and `based_on` are optional. `question_en`, `question_zh`, `answer_en` and
`answer_zh` are all required (the old single `answer` field is rejected by `add_day.py`; the page
still displays it for both languages if an old file has it).

The question box shows English by default; the 中文 / English button switches both question and
answer, and the choice is remembered in the browser (localStorage).

`\n` in question/answer text becomes a line break.
Use Unicode super/subscripts for nuclear notation, e.g. `²₁H + ³₁H → ⁴₂He + ¹₀n`, `10⁻¹²`.

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
