"""World Bank: remittances received by Nigeria (US$ and % of GDP) and average sending cost -> data/remittances.json."""
import json
import sys

from common import add_issue_note, http_get, now_iso, read_json, write_json

URL = "https://api.worldbank.org/v2/country/NGA/indicator/{code}?format=json&date=2000:2035&per_page=100"
IND = {"total": "BX.TRF.PWKR.CD.DT", "gdp": "BX.TRF.PWKR.DT.GD.ZS", "avg": "SI.RMT.COST.IB.ZS"}
NOTE = ("Changes in the share of GDP also reflect exchange-rate moves, such as the fall in Nigeria's GDP in US dollars "
        "after the 2023–24 naira devaluation, not only changes in remittances.")


def series(code):
    payload = json.loads(http_get(URL.format(code=code)))
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        raise ValueError(f"unexpected payload for {code}")
    return {str(int(r["date"])): r["value"] for r in payload[1] if r.get("value") is not None}


def main():
    old = read_json("remittances.json", {})
    try:
        s = {k: series(c) for k, c in IND.items()}
    except Exception as e:  # noqa: BLE001
        print("ERROR", e, file=sys.stderr)
        sys.exit(1)
    if not s["total"]:
        sys.exit(1)
    ty = max(s["total"], key=int)
    out = {"checked": now_iso(),
           "total": {"value_usd": round(s["total"][ty]), "year": int(ty), "source": "World Bank (BX.TRF.PWKR.CD.DT)",
                     "url": "https://data.worldbank.org/indicator/BX.TRF.PWKR.CD.DT?locations=NG",
                     "series": {y: round(v) for y, v in sorted(s["total"].items()) if int(y) >= int(ty) - 4}}}
    if s["gdp"]:
        gy = max(s["gdp"], key=int)
        out["gdp"] = {"value": round(s["gdp"][gy], 2), "year": int(gy), "note": NOTE,
                      "url": "https://data.worldbank.org/indicator/BX.TRF.PWKR.DT.GD.ZS?locations=NG",
                      "series": {y: round(v, 2) for y, v in sorted(s["gdp"].items()) if int(y) >= int(gy) - 4}}
    if s["avg"]:
        ay = max(s["avg"], key=int)
        out["avg"] = {"value_pct": round(s["avg"][ay], 2), "year": int(ay),
                      "url": "https://data.worldbank.org/indicator/SI.RMT.COST.IB.ZS?locations=NG"}
    prev = old.get("total", {})
    if prev and (prev.get("year") != out["total"]["year"] or prev.get("value_usd") != out["total"]["value_usd"]):
        add_issue_note("Remittance total updated", [
            f"- {out['total']['year']}: US${out['total']['value_usd'] / 1e9:.2f}bn (was US${prev.get('value_usd', 0) / 1e9:.2f}bn for {prev.get('year')})"])
    write_json("remittances.json", out)


if __name__ == "__main__":
    main()
