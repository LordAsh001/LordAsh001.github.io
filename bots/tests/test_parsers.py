"""Parser tests built from the page layouts observed on 10 Oct 2026.
Run:  python -m pytest bots/tests -q"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sources as S  # noqa: E402
from common import match_commodity, match_market, norm_state, to_number  # noqa: E402

RECENT = (date.today() - timedelta(days=3)).isoformat()


def test_helpers():
    assert norm_state("Kaduna State") == "Kaduna"
    assert norm_state("Abuja") == "FCT"
    assert norm_state("Adanawa") == "Adamawa"
    assert to_number("₦1,250.00") == 1250
    assert to_number("185-200") == 192.5
    assert match_commodity("Honey Beans (Oloyin)") == "oloyin"
    assert match_commodity("Rice Paddy") == "paddy"
    assert match_commodity("Guinea Corn (Dawa)") == "sorghum"
    assert match_commodity("Maize (Corn) White New Harvest") == "maize"
    assert match_commodity("White Cowpea") == "beansw"
    assert match_market("Kumo", "Gombe") == "kumo"
    assert match_market("Dawanau Market", "Kano") == "dawanau"
    assert match_market("Giwa Market", "Kaduna") == "giwa"
    assert match_market("Gboko Yam Market", "Benue") == "gboko"


def test_kasuwa():
    rows = [{"start_time": RECENT + "T00:00:00", "state": "Gombe", "market": "Kumo", "commodity": "Millet",
             "price_per_bag": 30000, "weight_of_bag_kg": 110, "price_per_kg": 273, "availability": "Medium"},
            {"start_time": RECENT + "T00:00:00", "state": "Adanawa", "market": "Mubi", "commodity": "White Maize",
             "price_per_bag": 31000, "weight_of_bag_kg": 110, "price_per_kg": 281},
            {"start_time": "2020-01-01T00:00:00", "state": "Gombe", "market": "Kumo", "commodity": "Millet", "price_per_kg": 9}]
    r = S.parse_kasuwa_prices(rows)
    assert len(r) == 2
    assert r[0]["c"] == "millet" and r[0]["where"] == ["kumo"] and r[0]["price"] == 273
    assert r[1]["where"] == ["mubi"]
    o = S.parse_kasuwa_open([{"date": RECENT + "T14:34:03", "commodity": "Soybeans", "location": "Giwa Market, Kaduna State", "unit": "bag", "price": 75000}])
    assert o[0]["where"] == ["giwa"] and o[0]["per"] is None


def test_lcfe():
    html = """<table class="table dataTable"><thead><tr><th>DATE</th><th>COMMODITIES</th><th>LOCATION</th><th>UNIT</th><th>UNIT PRICE</th></tr></thead>
    <tbody><tr><td>18/09/2026</td><td>SOYA BEANS</td><td>NIGER/NASARAWA/KEBBI</td><td>KG</td><td>770</td></tr>
    <tr><td>28/11/2025</td><td>PALM OIL</td><td>NASARAWA/KOGI/Abuja</td><td>1-LITRE</td><td>2,500</td></tr>
    <tr><td>13/06/2025</td><td>CASSAVA PEEL/UNPEEL (DRY)</td><td>NASARAWA</td><td>KG</td><td>185-200</td></tr></tbody></table>"""
    r = S.parse_lcfe(html)
    soy = [x for x in r if x["c"] == "soy"]
    assert {x["where"] for x in soy} == {"Niger", "Nasarawa", "Kebbi"} and soy[0]["date"] == "2026-09-18"
    assert any(x["c"] == "palmoil" and x["where"] == "FCT" for x in r)


def test_ncx():
    html = "<div>LIVE DATA Cocoa (COCOND) ₦3,500.00 30% Maize White (MZWKAN) ₦305.00 22% Soya (SOYKAD) ₦695.00 11.56% Maize White (MZWKAN) ₦305.00 22%</div>"
    r = S.parse_ncx(html)
    assert len(r) == 3
    assert {(x["c"], x["where"]) for x in r} == {("cocoa", "Ondo"), ("maize", "Kano"), ("soy", "Kaduna")}


def test_commodity_ng():
    html = """<table><tr><th>Commodity</th><th>Price of 50kg (₦)</th><th>Current Price (₦)</th></tr>
    <tr><td>Rice</td><td>58,000</td><td>2,400</td></tr><tr><td>Acha</td><td>30,000</td><td>1,200</td></tr></table>
    <table><tr><th>Commodity</th><th>Price of Big Basket (₦)</th></tr><tr><td>Tomatoes</td><td>68,000</td></tr></table>"""
    r = S.parse_commodity_ng(html)
    assert len(r) == 1 and r[0]["c"] == "ricel" and r[0]["per"] == 50


def test_avestack():
    html = """<table><tr><th>FOOD ITEM</th><th>WHOLESALE UNIT</th><th>AVERAGE PRICE</th><th>PRICE CHANGE</th><th>MAIN MARKET LOCATION</th><th>STOCK STATUS</th></tr>
    <tr><td>White Maize Grains Grains</td><td>100kg Bulk Bag</td><td>₦65,000</td><td>+4.8%</td><td>Dawanau Market (Kano)</td><td>High Demand</td></tr>
    <tr><td>Premium Yam Tubers Roots &amp; Tubers</td><td>Stack of 100 Large Tubers</td><td>₦320,000</td><td>-8.5%</td><td>Gboko Yam Market (Benue)</td><td>High</td></tr></table>"""
    r = S.parse_avestack(html)
    assert r[0]["where"] == ["dawanau"] and r[0]["per"] == 100
    assert r[1]["c"] == "yam" and r[1]["where"] == ["gboko"]


def test_opaindex():
    html = """<table><tr><td>Maize (white)</td><td>per kg</td><td>₦816</td><td>15 May 2026</td><td>0.0%</td></tr>
    <tr><td>Eggs (crate of 30)</td><td>crate of 30</td><td>₦6,143</td><td>15 Apr 2026</td></tr></table>"""
    r = S.parse_opaindex(html)
    assert r[0]["c"] == "maize" and r[0]["date"] == "2026-05" and r[0]["price"] == 816
    assert r[1]["c"] == "eggs" and r[1]["date"] == "2026-04"


def test_lagos_workbook():
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Mile 12 Market"
    ws.append([None, "MILE 12 MARKET"])
    ws.append([None, None, "January 2026"])
    ws.append(["S/N", "FOOD ITEM", "Week 2", "Week 3", "Average Price, Jan. '26 (NGN)  ", "Week 1", "Average Price, September '26 (NGN)"])
    ws.append([1, "50kg Bag of Nigerian Manufactured Rice", 60000, 60000, 60000, 53000, 53000])
    ws.append([2, "1kg of Tomato", 1100, 1200, 1150, 2400, 2375])
    ws.append([3, "Sweet Potatoes", 1, 1, 1, 1, 1])
    r = S.parse_lagos_workbook(wb)
    mk = [x for x in r if x["scope"] == "market"]
    assert {(x["c"], x["date"]) for x in mk} == {("ricel", "2026-01"), ("ricel", "2026-09"), ("tomato", "2026-01"), ("tomato", "2026-09")}
    assert any(x.get("series") == "lagos10" and x["c"] == "tomato" and x["date"] == "2026-09" for x in r)


def test_wfp_csv():
    d = (date.today() - timedelta(days=40)).isoformat()
    text = ("date,admin1,admin2,market,latitude,longitude,category,commodity,unit,priceflag,pricetype,currency,price,usdprice\n"
            "#date,#adm1+name,#adm2+name,#loc+market+name,#geo+lat,#geo+lon,#item+type,#item+name,#item+unit,#item+price+flag,#item+price+type,#currency,#value,#value+usd\n"
            f"{d},Kano,Dawakin Tofa,Dawanau,12.1,8.4,cereals and tubers,Maize (white),KG,actual,Wholesale,NGN,420,0.3\n"
            f"{d},Borno,Maiduguri,Unknown Market,11.8,13.1,cereals and tubers,Sorghum (white),100 KG,actual,Wholesale,NGN,36000,25\n")
    r = S.parse_wfp_csv(text)
    assert r[0]["where"] == ["dawanau"] and r[0]["per"] == 1
    assert r[1]["scope"] == "state" and r[1]["where"] == "Borno" and r[1]["per"] == 100


def test_market_days_build():
    import market_days as M
    qs = [{"id": "q1", "title": "name"}, {"id": "q2", "title": "state"}, {"id": "q3", "title": "lga"}, {"id": "q4", "title": "anchor"},
          {"id": "q5", "title": "cycle"}, {"id": "q6", "title": "updates"}, {"id": "q7", "title": "confirmDate"}, {"id": "q8", "title": "lat"}, {"id": "q9", "title": "lng"}]
    subs = [
        {"id": "s1", "submittedAt": "2026-10-01T10:00:00Z", "responses": [{"questionId": "q1", "value": "Ihugh Market"}, {"questionId": "q2", "value": "Benue"},
            {"questionId": "q3", "value": "Vandeikya"}, {"questionId": "q4", "value": "2026-09-30"}, {"questionId": "q5", "value": "5"},
            {"questionId": "q8", "value": "6.81"}, {"questionId": "q9", "value": "9.11"}]},
        {"id": "s2", "submittedAt": "2026-10-06T10:00:00Z", "responses": [{"questionId": "q6", "value": "s1"}, {"questionId": "q7", "value": "2026-10-05"}]},
        {"id": "s3", "submittedAt": "2026-10-06T11:00:00Z", "responses": [{"questionId": "q1", "value": "Bad"}, {"questionId": "q2", "value": "Benue"},
            {"questionId": "q3", "value": "Gboko"}, {"questionId": "q4", "value": "2099-01-01"}, {"questionId": "q5", "value": "5"}]},
        {"id": "s4", "submittedAt": "2026-10-07T11:00:00Z", "responses": [{"questionId": "q1", "value": "Spam"}, {"questionId": "q2", "value": "Kano"},
            {"questionId": "q3", "value": "Ungogo"}, {"questionId": "q4", "value": "2026-10-01"}, {"questionId": "q5", "value": "7"}]},
    ]
    e = M.build(M.flatten(subs, qs), blocked={"s4"})
    assert len(e) == 1
    assert e[0]["anchor"] == "2026-10-05" and e[0]["reports"] == 2 and e[0]["status"] == "confirmed" and e[0]["cycle"] == 5


def test_fuel_reports_build():
    import fuel_reports as F
    from datetime import date, timedelta
    d = (date.today() - timedelta(days=2)).isoformat()
    qs = [{"id": f"q{i}", "title": k} for i, k in enumerate(F.FIELDS)]
    def sub(i, vals):
        return {"id": i, "submittedAt": d + "T10:00:00Z", "responses": [{"questionId": f"q{F.FIELDS.index(k)}", "value": v} for k, v in vals.items()]}
    subs = [sub("a", {"product": "pms", "kind": "black", "price": "1650", "state": "Kano State", "date": d}),
            sub("b", {"product": "ago", "kind": "pump", "price": "99999", "state": "Lagos", "date": d}),
            sub("c", {"product": "pms", "kind": "pump", "price": "1400", "state": "Mars", "date": d}),
            sub("e", {"product": "lpg", "kind": "pump", "price": "1100", "state": "Abuja", "date": d})]
    r = F.build(F.flatten(subs, qs), blocked=set())
    assert [(x["id"], x["state"]) for x in r] == [("a", "Kano"), ("e", "FCT")]


def test_export_prices():
    from openpyxl import Workbook
    import export_prices as X
    wb = Workbook(); ws = wb.active; ws.title = "Monthly Prices"
    ws.append(["World Bank Commodity Price Data (The Pink Sheet)"]); ws.append([])
    ws.append([None, "Crude oil, Brent", "Cocoa", "Palm oil", "Soybeans", "Rice, Thai 5%"])
    ws.append([None, "($/bbl)", "($/kg)", "($/mt)", "($/mt)", "($/mt)"])
    ws.append(["2026M08", 90.9, 5.95, 1132, 482, 471])
    ws.append(["2026M09", 116.8, 5.92, 1180, 524, "…"])
    got = X.parse_wb_monthly(wb)
    cocoa = [r for r in got if r["c"] == "cocoa"]
    assert cocoa[-1] == {"src": "wb_pinksheet", "c": "cocoa", "label": X.WB_SERIES["Cocoa"][1], "usd_t": 5920.0,
                         "date": "2026-09-01", "basis": "monthly average"}
    assert not [r for r in got if r["c"] == "rice" and r["date"] == "2026-09-01"]   # '…' is skipped
    rows = [{"indicator_code": "US 3YC, Gulf", "date": "2026-09-30", "value": 236.0},
            {"indicator_code": "US 3YC, Gulf", "date": "2026-10-01", "value": 0}]
    a = X.parse_amis(rows, "maize_international_prices")
    assert len(a) == 1 and a[0]["usd_t"] == 236.0 and a[0]["c"] == "maize"
