"""Refresh the OpenStreetMap landfill layer of the Nigeria Waste Sites Atlas.

Downloads every feature tagged landuse=landfill or amenity=waste_transfer_station inside
Nigeria's bounding box from the Overpass API and writes waste-atlas/data/osm_landfills.geojson.
The atlas reads this file so the layer appears instantly instead of waiting for Overpass.
Leaves the existing file untouched if every Overpass server fails.
Data © OpenStreetMap contributors, ODbL.
"""
import json, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

OUT = "waste-atlas/data/osm_landfills.geojson"
BBOX = "4.2,2.6,13.9,14.7"
# Nigeria's national boundary (not just its bounding box, which would include Benin and Cameroon)
QUERY = ('[out:json][timeout:180];area["ISO3166-1"="NG"][admin_level=2]->.ng;('
         'nwr["landuse"="landfill"](area.ng);'
         'nwr["amenity"="waste_transfer_station"](area.ng);'
         ');out center tags;')
SERVERS = ["https://overpass-api.de/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter",
           "https://overpass.private.coffee/api/interpreter"]


def fetch():
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    for url in SERVERS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, data=body, headers={"User-Agent": "nigeria-waste-sites-atlas/1.0 (shagbaor.com)"})
                with urllib.request.urlopen(req, timeout=240) as r:
                    return json.load(r)["elements"]
            except Exception as e:  # noqa: BLE001
                print(f"{url} attempt {attempt + 1} failed: {e}", file=sys.stderr)
                time.sleep(20)
    return None


def main():
    els = fetch()
    if not els:
        print("Overpass unavailable; keeping the previous file.")
        return
    feats = []
    for e in els:
        lat = e.get("lat", e.get("center", {}).get("lat"))
        lon = e.get("lon", e.get("center", {}).get("lon"))
        if lat is None or not (4.0 <= lat <= 14.0 and 2.5 <= lon <= 14.8):
            continue
        t = e.get("tags", {})
        keep = {k: v for k, v in t.items() if not k.startswith("source")}
        feats.append({"type": "Feature",
                      "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                      "properties": {"osm_type": e["type"], "osm_id": e["id"], "tags": dict(list(keep.items())[:12])}})
    feats.sort(key=lambda f: (f["properties"]["osm_type"], f["properties"]["osm_id"]))
    out = {"type": "FeatureCollection",
           "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
           "attribution": "© OpenStreetMap contributors, ODbL",
           "features": feats}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(feats)} features to {OUT}")


if __name__ == "__main__":
    main()
