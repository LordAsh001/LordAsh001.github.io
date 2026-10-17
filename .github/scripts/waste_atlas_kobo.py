#!/usr/bin/env python3
"""Publish APPROVED public reports from KoboToolbox to the Nigeria Waste Sites Atlas.

How it works
  1. You review reports in KoboToolbox (Data > Table) and set "Validation status" to
     "Approved" for the real ones. Nothing else is ever published.
  2. This script (run daily by .github/workflows/waste-atlas-kobo.yml) downloads the approved
     reports, saves a cleaned photo for each (resized, all metadata removed) and writes
     waste-atlas/data/reports.geojson, which the atlas loads.
  3. If you later change a report back from "Approved", it disappears at the next run.

Never published: the reporter's contact details, who they are, where they heard about the
form, and the free-text notes (which may contain names). Only the structured answers,
the location and the photo(s) go on the map, as the form's consent statement says.

Needs the repository secret KOBO_TOKEN (your KoboToolbox API key).
"""
import io, json, os, sys, urllib.request, urllib.parse, datetime, glob

KOBO_SERVER = os.environ.get("KOBO_SERVER", "https://kf.kobotoolbox.org").rstrip("/")
ASSET_UID = os.environ.get("KOBO_ASSET", "a9kzeezANZDts4FDYhpYPe")
TOKEN = os.environ.get("KOBO_TOKEN", "").strip()
OUT_DIR = os.environ.get("OUT_DIR", "waste-atlas/data")
OUT = os.path.join(OUT_DIR, "reports.geojson")
PHOTO_DIR = os.path.join(OUT_DIR, "reports")
PHOTO_MAX = 1024  # pixels on the long side

STATES = {"fct_abuja": "FCT", "akwa_ibom": "Akwa Ibom", "cross_river": "Cross River"}
KEEP = ["state", "lga", "place", "site_type", "size", "burning", "waste_types", "near_water",
        "dist_home", "age", "status", "official"]


def api(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Token {TOKEN}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def field(sub, name):
    """Answers are keyed by their group path, e.g. 'g_where/state'; find the one ending in name."""
    if name in sub:
        return sub[name]
    for k, v in sub.items():
        if k.endswith("/" + name):
            return v
    return None


def save_photo(att, dest):
    """Download one photo, shrink it and strip all metadata (EXIF: camera, phone, time)."""
    from PIL import Image, ImageOps
    url = att.get("download_medium_url") or att.get("download_large_url") or att.get("download_url")
    if not url:
        return False
    try:
        im = Image.open(io.BytesIO(api(url)))
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((PHOTO_MAX, PHOTO_MAX))
        clean = Image.new("RGB", im.size)
        clean.paste(im)
        clean.save(dest, "JPEG", quality=80, optimize=True)
        return True
    except Exception as e:  # a broken photo should not stop the other reports
        print(f"  photo skipped ({e})")
        return False


def main():
    if not TOKEN:
        sys.exit("KOBO_TOKEN is not set. Add your KoboToolbox API key as a repository secret named KOBO_TOKEN.")
    url = f"{KOBO_SERVER}/api/v2/assets/{ASSET_UID}/data/?format=json&limit=1000"
    subs = []
    while url:
        page = json.loads(api(url))
        subs += page.get("results", [])
        url = page.get("next")
    approved = [s for s in subs if (s.get("_validation_status") or {}).get("uid") == "validation_status_approved"]
    print(f"{len(subs)} reports in KoboToolbox, {len(approved)} approved.")

    os.makedirs(PHOTO_DIR, exist_ok=True)
    feats, keep_files = [], set()
    for s in approved:
        loc = field(s, "location")
        try:
            lat, lon = [float(x) for x in str(loc).split()[:2]]
        except Exception:
            print(f"  report {s.get('_id')} has no usable location; skipped")
            continue
        if not (3.5 < lat < 14.5 and 2.5 < lon < 15):
            print(f"  report {s.get('_id')} is outside Nigeria; skipped")
            continue
        rid = str(s.get("_id"))
        props = {"id": "rep" + rid}
        for k in KEEP:
            v = field(s, k)
            if v not in (None, ""):
                props[k] = v
        if "state" in props:
            st = props["state"]
            props["state"] = STATES.get(st, st.replace("_", " ").title())
        props["report_date"] = field(s, "report_date") or (s.get("_submission_time") or "")[:10]
        vs = s.get("_validation_status") or {}
        if vs.get("timestamp"):
            props["approved"] = datetime.datetime.fromtimestamp(vs["timestamp"], datetime.timezone.utc).strftime("%Y-%m-%d")
        photos = []
        atts = s.get("_attachments") or []
        for n in ("photo_1", "photo_2"):
            fname = field(s, n)
            if not fname:
                continue
            att = next((a for a in atts if str(a.get("question_xpath", "")).endswith(n)), None) or \
                  next((a for a in atts if str(a.get("filename", "")).endswith(str(fname))), None)
            if not att:
                continue
            name = f"{rid}_{n[-1]}.jpg"
            dest = os.path.join(PHOTO_DIR, name)
            if os.path.exists(dest) or save_photo(att, dest):
                photos.append("data/reports/" + name)
                keep_files.add(name)
        if photos:
            props["photos"] = photos
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                      "properties": props})

    # remove photos of reports that are no longer approved
    for p in glob.glob(os.path.join(PHOTO_DIR, "*.jpg")):
        if os.path.basename(p) not in keep_files:
            os.remove(p)
            print(f"  removed {os.path.basename(p)} (no longer approved)")

    feats.sort(key=lambda f: f["properties"]["id"])
    fc = {"type": "FeatureCollection", "name": "Nigeria Waste Sites Atlas: approved public reports",
          "source": "KoboToolbox public reporting form, reviewed before publication", "features": feats}
    old = None
    if os.path.exists(OUT):
        with open(OUT) as f:
            old = json.load(f)
    if old and old.get("features") == feats:
        print("No change.")
        return
    fc["updated"] = datetime.date.today().isoformat()
    with open(OUT, "w") as f:
        json.dump(fc, f, ensure_ascii=False, indent=1)
    print(f"Wrote {len(feats)} approved reports to {OUT}.")


if __name__ == "__main__":
    main()
