"""Build market-atlas/data/export-prices.json: international reference prices for the Export Camp tab.

Sources
  wb_pinksheet  World Bank Commodity Price Data ("Pink Sheet"), monthly averages, CC BY 4.0.
                The bot reads the commodity-markets page, finds the CMO-Historical-Data-Monthly.xlsx link
                and keeps the last 13 months of the series listed in WB_SERIES.
  amis          AMIS Market Monitor export quotations (FOB, US$/t) for maize, wheat, rice, soybeans and
                vegetable oils, read through the same public data endpoint the AMIS website uses.

Usage:  python bots/export_prices.py market-atlas/data
If a source fails, its previous records are kept and status says why (same rule as collect.py).
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import USER_AGENT, get, now_iso  # noqa: E402

WB_PAGE = "https://www.worldbank.org/en/research/commodity-markets"
AMIS_ENDPOINT = "https://www.amis-outlook.org/data/fetch"

# Pink Sheet column header -> (atlas key, label, multiplier to US$/t)
WB_SERIES = {
    "Cocoa": ("cocoa", "Cocoa beans (ICCO average)", 1000),
    "Coffee, Robusta": ("coffee_rob", "Coffee, Robusta", 1000),
    "Palm oil": ("palmoil", "Palm oil (Malaysia/Indonesia, CIF Rotterdam)", 1),
    "Palm kernel oil": ("pko", "Palm kernel oil", 1),
    "Groundnuts": ("groundnut", "Groundnuts (US runners 40/50, CIF Rotterdam)", 1),
    "Groundnut oil": ("gnoil", "Groundnut oil", 1),
    "Soybeans": ("soy", "Soybeans (US, CIF Rotterdam)", 1),
    "Soybean meal": ("soymeal", "Soybean meal", 1),
    "Soybean oil": ("soyoil", "Soybean oil", 1),
    "Maize": ("maize", "Maize (US No. 2 yellow, FOB Gulf)", 1),
    "Sorghum": ("sorghum", "Sorghum (US No. 2 milo, FOB Gulf)", 1),
    "Rice, Thai 5%": ("rice", "Rice (Thai 5% broken, FOB Bangkok)", 1),
    "Wheat, US HRW": ("wheat", "Wheat (US HRW, FOB Gulf)", 1),
    "Sugar, world": ("sugar", "Sugar, world (ISA)", 1000),
    "Cotton, A Index": ("cotton", "Cotton (Cotlook A index)", 1000),
    "Rubber, TSR20": ("rubber", "Rubber, TSR20", 1000),
}

AMIS_SERIES = {
    # (table, indicator_code) -> (atlas key, label)
    ("maize_international_prices", "US 3YC, Gulf"): ("maize", "Maize, US No. 3 yellow, FOB Gulf (IGC)"),
    ("wheat_international_prices", "US HRW (11_5%), Gulf"): ("wheat", "Wheat, US HRW 11.5%, FOB Gulf (IGC)"),
    ("wheat_international_prices", "EU (France) Grade 1, Rouen"): ("wheat", "Wheat, EU (France) Grade 1, FOB Rouen (IGC)"),
    ("rice_international_prices", "Thailand, 100% Grade B"): ("rice", "Rice, Thai 100% Grade B, FOB Bangkok"),
    ("soybean_international_prices", "US 2Y (Gulf)"): ("soy", "Soybeans, US No. 2 yellow, FOB Gulf (IGC)"),
    ("igc_vegetable_oils", "IGC-VO-POI"): ("palmoil", "Palm oil, Indonesia (IGC)"),
    ("igc_vegetable_oils", "IGC-VO-SOA"): ("soyoil", "Soybean oil, Argentina (IGC)"),
}


def norm(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def parse_wb_monthly(wb, months: int = 13) -> list[dict]:
    """Sheet 'Monthly Prices': a header row with commodity names, a unit row under it, then rows '2026M09'."""
    ws = wb["Monthly Prices"] if "Monthly Prices" in wb.sheetnames else wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hdr_i = next(i for i, r in enumerate(rows) if any(norm(c) == "cocoa" for c in r))
    header = [norm(c) for c in rows[hdr_i]]
    want = {norm(k): v for k, v in WB_SERIES.items()}
    cols = {j: want[h] for j, h in enumerate(header) if h in want}
    data = [r for r in rows[hdr_i + 1:] if r and isinstance(r[0], str) and re.fullmatch(r"\d{4}M\d{2}", r[0].strip())]
    out = []
    for r in data[-months:]:
        y, m = r[0].strip().split("M")
        for j, (key, label, mult) in cols.items():
            v = r[j]
            if isinstance(v, (int, float)) and v > 0:
                out.append({"src": "wb_pinksheet", "c": key, "label": label, "usd_t": round(v * mult, 1),
                            "date": f"{y}-{m}-01", "basis": "monthly average"})
    return out


def collect_wb() -> list[dict]:
    from openpyxl import load_workbook
    html = get(WB_PAGE)
    m = re.search(r'https://thedocs\.worldbank\.org/[^"\']+CMO-Historical-Data-Monthly\.xlsx', html)
    if not m:
        raise RuntimeError("monthly data link not found on the commodity-markets page")
    wb = load_workbook(io.BytesIO(get(m.group(0), binary=True)), read_only=True, data_only=True)
    return parse_wb_monthly(wb)


def parse_amis(rows: list[dict], table: str) -> list[dict]:
    out = []
    for r in rows:
        k = (table, r.get("indicator_code"))
        if k in AMIS_SERIES and (r.get("value") or 0) > 0:
            key, label = AMIS_SERIES[k]
            out.append({"src": "amis", "c": key, "label": label, "usd_t": round(float(r["value"]), 1),
                        "date": str(r["date"])[:10], "basis": "export quotation"})
    return out


def collect_amis() -> list[dict]:
    out = []
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Content-Type": "application/json"})
    for table in sorted({t for t, _ in AMIS_SERIES}):
        q = ("SELECT indicator_code, date, value FROM `fao-maps.fao_amis.amis_indicators` "
             f"WHERE indicator='{table}' AND value>0 AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 400 DAY) ORDER BY date ASC")
        r = s.post(AMIS_ENDPOINT, data=json.dumps({"query": q}), timeout=40)
        r.raise_for_status()
        out += parse_amis(r.json(), table)
    # keep month-end values only (the last quote in each month) so the file stays small
    last = {}
    for x in out:
        last[(x["label"], x["date"][:7])] = x
    return sorted(last.values(), key=lambda x: (x["label"], x["date"]))


REGISTRY = {"wb_pinksheet": collect_wb, "amis": collect_amis}


def main(outdir: str):
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    f = out / "export-prices.json"
    prev = json.loads(f.read_text()) if f.exists() else {"records": [], "status": {}}
    records, status = [], {}
    for name, fn in REGISTRY.items():
        try:
            got = fn()
            if not got:
                raise RuntimeError("read, but no prices recognised")
            records += got
            status[name] = {"ok": True, "records": len(got), "checked": now_iso(), "last_success": now_iso()}
            print(f"[ok]   {name}: {len(got)}")
        except Exception as e:  # keep the previous good data
            records += [r for r in prev.get("records", []) if r.get("src") == name]
            old = prev.get("status", {}).get(name, {})
            status[name] = {"ok": False, "error": str(e)[:300], "checked": now_iso(), "last_success": old.get("last_success")}
            print(f"[fail] {name}: {e}")
    f.write_text(json.dumps({"generated": now_iso(), "records": records, "status": status}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parent.parent / "market-atlas" / "data"))
