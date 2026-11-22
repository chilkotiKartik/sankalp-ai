#!/usr/bin/env python3
"""
P9.14: police stations, hospitals and fire stations for every state and UT, from OpenStreetMap
(© OpenStreetMap contributors, ODbL 1.0). BUILD-TIME ONLY: the running app never contacts OSM servers.

1. Download once (public data, a bounding box of India; no personal data is sent):

   curl -s -m 1000 --data-urlencode "data@query.txt" https://overpass.kumi.systems/api/interpreter -o india.tsv
   where query.txt =
   [out:csv(::type,::id,::lat,::lon,amenity,name,"name:en",phone,"contact:phone","addr:street","addr:city","addr:postcode";true;"\t")]
   [timeout:900][maxsize:1073741824];(nwr["amenity"~"^(police|hospital|fire_station)$"](6.5,68.0,37.2,97.5););out center;

2. python3 -I scripts/build-places.py india.tsv

Each point is kept only if it lies inside a district boundary (config/geo/<state>.json) and is tagged with that
state and district. A listed phone number is kept; otherwise the national number is shown (police 112,
hospital 108, fire 101). Writes config/places/<state-id>.json.
"""
import csv, json, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --fetch <dir>: download per state (tiled for big states) in compact CSV, then write <dir>/india.tsv.
if len(sys.argv) > 2 and sys.argv[1] == "--fetch":
    import subprocess
    d = sys.argv[2]; os.makedirs(d, exist_ok=True)
    servers = [os.environ.get("OVERPASS_URL", "https://overpass.kumi.systems/api/interpreter")]
    cols = '::type,::id,::lat,::lon,amenity,name,"name:en",phone,"contact:phone","addr:street","addr:city","addr:postcode"'
    header = None; rows = []
    for st in json.load(open(os.path.join(ROOT, "config", "states.json")))["states"]:
        b = st["bounds"]; span = max(b["north"] - b["south"], b["east"] - b["west"]); k = 1 if span <= 3 else 2 if span <= 7 else 3
        for i in range(k):
            for j in range(k):
                s = b["south"] + (b["north"] - b["south"]) * i / k; n = b["south"] + (b["north"] - b["south"]) * (i + 1) / k
                w = b["west"] + (b["east"] - b["west"]) * j / k; e = b["west"] + (b["east"] - b["west"]) * (j + 1) / k
                f = os.path.join(d, f"{st['id']}-{i}{j}.tsv")
                q = f'[out:csv({cols};true;"\\t")][timeout:300];(nwr["amenity"~"^(police|hospital|fire_station)$"]({s:.4f},{w:.4f},{n:.4f},{e:.4f}););out center;'
                for attempt in range(20):
                    if os.path.exists(f) and open(f, encoding="utf-8").readline().startswith("@type"):
                        break
                    url = servers[attempt % len(servers)]
                    subprocess.run(["curl", "-s", "-m", "420", "-A", "SANKALP-AI-build/1.0 (civic app data build)", "--data-urlencode", f"data={q}", url, "-o", f])
                    if not (os.path.exists(f) and open(f, encoding="utf-8").readline().startswith("@type")):
                        time.sleep(min(30 + 15 * attempt, 180))
                else:
                    sys.exit(f"failed: {f}")
                lines = open(f, encoding="utf-8").read().splitlines()
                header = header or lines[0]; rows.extend(lines[1:])
                print(f"fetched {st['id']} tile {i}{j}: {len(lines) - 1} rows", flush=True)
    with open(os.path.join(d, "india.tsv"), "w", encoding="utf-8") as fh:
        fh.write(header + "\n" + "\n".join(rows) + "\n")
    print("wrote", os.path.join(d, "india.tsv"), len(rows), "rows")
    sys.exit(0)

SRC = sys.argv[1] if len(sys.argv) > 1 else None
if not SRC or not os.path.exists(SRC):
    sys.exit("usage: build-places.py <india.tsv>")
OUT = os.path.join(ROOT, "config", "places")
os.makedirs(OUT, exist_ok=True)


def rings(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [p for p in polys if p]


def inside_ring(x, y, ring):
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def in_poly(x, y, poly):
    return inside_ring(x, y, poly[0]) and not any(inside_ring(x, y, h) for h in poly[1:])


def bbox_of(polys):
    xs = [x for p in polys for x, _ in p[0]]
    ys = [y for p in polys for _, y in p[0]]
    return min(xs), min(ys), max(xs), max(ys)


reg = json.load(open(os.path.join(ROOT, "config", "states.json")))
districts = []  # (state_id, district, polys, bbox)
for st in reg["states"]:
    for f in json.load(open(os.path.join(ROOT, "config", "geo", f"{st['id']}.json")))["features"]:
        polys = rings(f["geometry"])
        districts.append((st["id"], f["properties"]["name"], polys, bbox_of(polys)))


def locate(lat, lng):
    for sid, d, polys, (x0, y0, x1, y1) in districts:
        if x0 <= lng <= x1 and y0 <= lat <= y1 and any(in_poly(lng, lat, p) for p in polys):
            return sid, d
    return None, None


def clean_phone(raw):
    raw = (raw or "").split(";")[0].strip()
    digits = re.sub(r"[^\d]", "", raw)
    return raw if 3 <= len(digits) <= 13 else ""


out = {st["id"]: {"policeStations": [], "emergencyServices": []} for st in reg["states"]}
seen = set()
kept = dropped = 0
with open(SRC, encoding="utf-8") as fh:
    for row in csv.DictReader(fh, delimiter="\t"):
        key = f"{row['@type']}/{row['@id']}"
        if key in seen:
            continue
        seen.add(key)
        try:
            lat, lng = float(row["@lat"]), float(row["@lon"])
        except (TypeError, ValueError):
            dropped += 1
            continue
        name = (row.get("name:en") or row.get("name") or "").strip()
        if not name:
            dropped += 1
            continue
        sid, district = locate(lat, lng)
        if not sid:
            dropped += 1
            continue
        kept += 1
        g = {"lat": round(lat, 6), "lng": round(lng, 6)}
        phone = clean_phone(row.get("phone") or row.get("contact:phone"))
        address = ", ".join(x for x in (row.get("addr:street"), row.get("addr:city"), row.get("addr:postcode")) if x) or district
        oid = f"osm-{row['@type'][0]}{row['@id']}"
        if row["amenity"] == "police":
            out[sid]["policeStations"].append({"id": oid, "name": name[:120], "address": address[:200], "phone": phone or "112",
                                               "geo": g, "ward": f"{district} (district)", "district": district})
        else:
            kind = "hospital" if row["amenity"] == "hospital" else "fire"
            out[sid]["emergencyServices"].append({"id": oid, "type": kind, "name": name[:120], "district": district,
                                                  "address": address[:200], "phone": phone or ("108" if kind == "hospital" else "101"), "geo": g})

built = time.strftime("%Y-%m-%d")
total = {"police": 0, "hospital": 0, "fire": 0}
for sid, d in out.items():
    d["policeStations"].sort(key=lambda x: (x["district"], x["name"]))
    d["emergencyServices"].sort(key=lambda x: (x["type"], x["district"], x["name"]))
    with open(os.path.join(OUT, f"{sid}.json"), "w", encoding="utf-8") as fh:
        json.dump({"_source": f"OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), built {built} by scripts/build-places.py. "
                              "Phone shows the national number (112 / 108 / 101) where none is listed.",
                   **d}, fh, ensure_ascii=False, separators=(",", ":"))
    h = sum(1 for s in d["emergencyServices"] if s["type"] == "hospital")
    f_ = len(d["emergencyServices"]) - h
    total["police"] += len(d["policeStations"]); total["hospital"] += h; total["fire"] += f_
    print(f"{sid}: {len(d['policeStations'])} police, {h} hospitals, {f_} fire")
print(f"TOTAL kept {kept} (police {total['police']}, hospitals {total['hospital']}, fire {total['fire']}), dropped {dropped} (unnamed or outside India)")
