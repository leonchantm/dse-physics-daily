#!/usr/bin/env python3
"""Add (or update) one day's entry for the DSE Physics Daily site.

Usage:
    python3 scripts/add_day.py path/to/day.json            # validate, copy to data/, update index
    python3 scripts/add_day.py path/to/day.json --no-overwrite
    python3 scripts/add_day.py --check                     # validate every file in data/

The day JSON must look like:
{
  "date": "YYYY-MM-DD",
  "news": [
    {"title": "...", "summary": "...", "topic": "...",
     "source_name": "...", "source_url": "https://...",
     "source_date": "2/10",                     (optional)
     "links": [{"label": "...", "url": "https://..."}]   (optional)}
  ],
  "question": {
    "based_on": 2,                               (optional, 1-based news index)
    "story": "...", "question_en": "...", "question_zh": "...",
    "answer_en": "...", "answer_zh": "..."
  }
}
Exit code is non-zero on any validation error (nothing is written in that case).
"""
import argparse
import datetime as dt
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
INDEX = os.path.join(DATA, "index.json")


class ValidationError(Exception):
    pass


def _str(obj, key, where, required=True):
    v = obj.get(key)
    if v is None or (isinstance(v, str) and not v.strip()):
        if required:
            raise ValidationError(f"{where}: missing or empty '{key}'")
        return
    if not isinstance(v, str):
        raise ValidationError(f"{where}: '{key}' must be a string")


def _url(obj, key, where, required=True):
    _str(obj, key, where, required)
    v = obj.get(key)
    if v and not (v.startswith("https://") or v.startswith("http://")):
        raise ValidationError(f"{where}: '{key}' must start with http:// or https:// (got {v!r})")


def validate_day(day):
    if not isinstance(day, dict):
        raise ValidationError("top level must be a JSON object")
    date = day.get("date")
    try:
        if not isinstance(date, str) or len(date) != 10:
            raise ValueError
        dt.date.fromisoformat(date)
    except ValueError:
        raise ValidationError(f"'date' must be YYYY-MM-DD (got {date!r})")

    news = day.get("news")
    if not isinstance(news, list) or not news:
        raise ValidationError("'news' must be a non-empty list")
    for i, item in enumerate(news, 1):
        w = f"news[{i}]"
        if not isinstance(item, dict):
            raise ValidationError(f"{w}: must be an object")
        for k in ("title", "summary", "topic", "source_name"):
            _str(item, k, w)
        _url(item, "source_url", w)
        _str(item, "source_date", w, required=False)
        links = item.get("links", [])
        if links is None:
            links = []
        if not isinstance(links, list):
            raise ValidationError(f"{w}: 'links' must be a list")
        for j, link in enumerate(links, 1):
            lw = f"{w}.links[{j}]"
            if not isinstance(link, dict):
                raise ValidationError(f"{lw}: must be an object")
            _str(link, "label", lw)
            _url(link, "url", lw)

    q = day.get("question")
    if not isinstance(q, dict):
        raise ValidationError("'question' must be an object")
    for k in ("story", "question_en", "question_zh", "answer_en", "answer_zh"):
        _str(q, k, "question")
    if "answer" in q:
        raise ValidationError("question: legacy 'answer' field is not allowed; use 'answer_en' and 'answer_zh'")
    b = q.get("based_on")
    if b is not None:
        if not isinstance(b, int) or isinstance(b, bool) or not (1 <= b <= len(news)):
            raise ValidationError(f"question: 'based_on' must be an integer 1..{len(news)}")
    return date


def load_index():
    if not os.path.exists(INDEX):
        return []
    with open(INDEX, encoding="utf-8") as f:
        idx = json.load(f)
    if isinstance(idx, dict):  # tolerate {"dates": [...]}
        idx = idx.get("dates", [])
    return [d for d in idx if isinstance(d, str)]


def write_json(path, obj):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def check_all():
    ok = True
    idx = load_index()
    for d in idx:
        p = os.path.join(DATA, f"{d}.json")
        try:
            with open(p, encoding="utf-8") as f:
                day = json.load(f)
            if validate_day(day) != d:
                raise ValidationError(f"date inside file != {d}")
            print(f"OK   {d}")
        except (OSError, json.JSONDecodeError, ValidationError) as e:
            ok = False
            print(f"FAIL {d}: {e}")
    if idx != sorted(set(idx), reverse=True):
        ok = False
        print("FAIL index.json is not deduped / sorted newest first")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("day_json", nargs="?", help="path to the day's JSON file")
    ap.add_argument("--no-overwrite", action="store_true", help="fail if data/<date>.json already exists")
    ap.add_argument("--check", action="store_true", help="validate all existing data and exit")
    args = ap.parse_args()

    if args.check:
        sys.exit(0 if check_all() else 1)
    if not args.day_json:
        ap.error("day_json is required (or use --check)")

    try:
        with open(args.day_json, encoding="utf-8") as f:
            day = json.load(f)
        date = validate_day(day)
    except (OSError, json.JSONDecodeError, ValidationError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(DATA, exist_ok=True)
    dest = os.path.join(DATA, f"{date}.json")
    if os.path.exists(dest) and args.no_overwrite:
        print(f"ERROR: {dest} already exists (--no-overwrite)", file=sys.stderr)
        sys.exit(1)
    existed = os.path.exists(dest)
    write_json(dest, day)

    idx = sorted(set(load_index()) | {date}, reverse=True)
    write_json(INDEX, idx)
    print(f"{'Updated' if existed else 'Added'} data/{date}.json; index.json now has {len(idx)} date(s), newest {idx[0]}")


if __name__ == "__main__":
    main()
