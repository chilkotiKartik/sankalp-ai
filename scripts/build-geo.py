#!/usr/bin/env python3
"""
P9.2: build the national geography from the `vardhan-maps` dataset (MIT code; boundary data derived from
OpenStreetMap, ODbL 1.0 — attribution "© OpenStreetMap contributors"; GoI border depiction patched).

The package is only READ as data — nothing from it is executed. Usage:

    mkdir -p /tmp/vm && curl -sL https://registry.npmjs.org/vardhan-maps/-/vardhan-maps-0.20.0.tgz | tar xz -C /tmp/vm
    python3 -I scripts/build-geo.py /tmp/vm/package/dist

Writes:
  config/geo/<state-id>.json   district boundaries (low resolution, 4-decimal coordinates) for each state/UT
  config/geo/india-states.json state outlines (low resolution)
  config/states.json           adds every district (name + centre) and the real bounding box to each state
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else None
if not SRC or not os.path.isdir(SRC):
    sys.exit("usage: build-geo.py <vardhan-maps/package/dist>")

HEADER = re.compile(r"^// src/data/generated/(.+?)\.js(?:on)?\s*$", re.M)


def sections():
    """Yield (module path, text) for every generated-data module found in the bundle files."""
    for root, _, files in os.walk(SRC):
        for f in files:
            if not f.endswith(".js"):
                continue
            text = open(os.path.join(root, f), encoding="utf-8").read()
            marks = list(HEADER.finditer(text))
            for i, m in enumerate(marks):
                end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
                yield m.group(1), text[m.end():end]


def object_literal(body):
    """The `{ ... }` assigned by `var x = {...};` — brace-matched, string-aware."""
    start = body.find("{")
    if start < 0:
        return None
    depth, i, in_str = 0, start, False
    while i < len(body):
        c = body[i]
        if in_str:
            if c == "\\":
                i += 1
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return body[start:i + 1]
        i += 1
    return None


def parse(lit):
    lit = re.sub(r"\\x([0-9A-Fa-f]{2})", lambda m: "\\u00" + m.group(1), lit)  # JS \xNN → JSON \u00NN
    try:
        return json.loads(lit)
    except json.JSONDecodeError:
        # states.*.json are emitted with bare keys
        return json.loads(re.sub(r'([{,]\s*)(type|features|properties|name|code|state|geometry|coordinates)\s*:', r'\1"\2":', lit))


def rnd(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 4), round(coords[1], 4)]
    return [rnd(c) for c in coords]


def rings(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [p[0] for p in polys if p and len(p[0]) >= 3]


def area_centroid(ring):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        k = x1 * y2 - x2 * y1
        a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k
    if abs(a) < 1e-12:
        xs, ys = zip(*ring)
        return 0.0, sum(xs) / len(xs), sum(ys) / len(ys)
    return abs(a) / 2, cx / (3 * a), cy / (3 * a)


def inside(x, y, ring):
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def centre(geom):
    """Area-weighted centroid of the largest polygon; if it falls outside (crescent shapes), the vertex mean
    of that polygon nudged to the nearest vertex — always a point on or in the district."""
    parts = sorted((area_centroid(r) + (r,) for r in rings(geom)), key=lambda t: -t[0])
    _, x, y, ring = parts[0]
    if not inside(x, y, ring):
        x, y = min(ring, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)
    return {"lat": round(y, 4), "lng": round(x, 4)}


def bbox(geoms):
    xs, ys = [], []
    for g in geoms:
        for r in rings(g):
            for x, y in r:
                xs.append(x); ys.append(y)
    return {"south": round(min(ys), 4), "west": round(min(xs), 4), "north": round(max(ys), 4), "east": round(max(xs), 4)}


districts_low, states_low = {}, None
for path, body in sections():
    lit = object_literal(body)
    if not lit:
        continue
    if path.startswith("districts/low/") and not path.endswith("index"):
        districts_low[path.split("/")[-1]] = parse(lit)
    elif path == "states.low":
        states_low = parse(lit)

reg_path = os.path.join(ROOT, "config", "states.json")
reg = json.load(open(reg_path, encoding="utf-8"))
slug = lambda name: re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
out_dir = os.path.join(ROOT, "config", "geo")
os.makedirs(out_dir, exist_ok=True)

total = 0
for st in reg["states"]:
    fc = districts_low.get(slug(st["name"]))
    if not fc:
        sys.exit(f"no district data for {st['name']} ({slug(st['name'])})")
    feats = []
    for f in fc["features"]:
        name = re.sub(r"\s+district$", "", f["properties"]["name"].strip(), flags=re.I)
        geom = {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}
        feats.append({"type": "Feature", "properties": {"name": name}, "geometry": geom})
    feats.sort(key=lambda f: f["properties"]["name"])
    st["districts"] = [{"name": f["properties"]["name"], "center": centre(f["geometry"])} for f in feats]
    st["bounds"] = bbox([f["geometry"] for f in feats])
    total += len(feats)
    with open(os.path.join(out_dir, f"{st['id']}.json"), "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": feats}, fh, ensure_ascii=False, separators=(",", ":"))

if states_low:
    by_name = {slug(f["properties"]["name"]): f for f in states_low["features"]}
    feats = []
    for st in reg["states"]:
        f = by_name.get(slug(st["name"]))
        if f:
            feats.append({"type": "Feature", "properties": {"id": st["id"], "name": st["name"]},
                          "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}})
    with open(os.path.join(out_dir, "india-states.json"), "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": feats}, fh, ensure_ascii=False, separators=(",", ":"))

reg["_geo"] = ("District names, centres and boundaries: vardhan-maps 0.20.0 (boundaries © OpenStreetMap contributors, ODbL 1.0; "
               "GoI border depiction). Rebuild with scripts/build-geo.py. Not survey-grade.")
with open(reg_path, "w", encoding="utf-8") as fh:
    json.dump(reg, fh, ensure_ascii=False, indent=1)
    fh.write("\n")
print(f"{len(reg['states'])} states/UTs, {total} districts")
