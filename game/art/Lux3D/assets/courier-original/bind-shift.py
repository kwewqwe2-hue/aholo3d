"""Bind the intermediate courier in art/build/lux-base after prepare-lux.py."""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[4]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--prepared-dir", type=Path, default=ROOT / "art/build/lux-base",
                    help="Directory containing the intermediate courier.glb and its manifest")
DIRECTORY = parser.parse_args().prepared_dir.resolve()
MODEL = DIRECTORY / "courier.glb"
manifest_file = DIRECTORY / "manifest.json"
manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
raw = MODEL.read_bytes()
length, = struct.unpack_from("<I", raw, 12)
doc = json.loads(raw[20:20 + length])
binary = raw[28 + length:]
if any(mesh.get("weights") or any(primitive.get("targets") for primitive in mesh["primitives"])
       for mesh in doc["meshes"]):
    raise ValueError("Expected the intermediate courier, before the final corrective shapes")

# The original two scenes, their UV charts and texture images are shared.
assert [m["name"] for m in doc["meshes"][:2]] == ["CourierStanding", "CourierHead"]
for key, count in (("scenes", 2), ("meshes", 2), ("nodes", 2), ("accessors", 8), ("bufferViews", 10)):
    doc[key] = doc[key][:count]
doc["materials"] = doc["materials"][:1]
doc["images"] = doc["images"][:2]
doc["textures"] = doc["textures"][:2]
chunks = [binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
          for v in doc["bufferViews"]]


def attribute(i):
    a = doc["accessors"][i]
    columns = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[a["type"]]
    dtype = "<f4" if a["componentType"] == 5126 else "<u2"
    return np.frombuffer(chunks[a["bufferView"]], dtype, a["count"] * columns).reshape(-1, columns)


def accessor(data, gl_type, shape, normalized=False):
    view = len(chunks)
    chunks.append(data.tobytes())
    doc["bufferViews"].append({"buffer": 0})
    record = {"bufferView": view, "componentType": gl_type, "type": shape, "count": len(data)}
    if normalized:
        record["normalized"] = True
    doc["accessors"].append(record)
    return len(doc["accessors"]) - 1


positions, normals, uv = (attribute(i) for i in range(3))
faces = attribute(3).reshape(-1, 3)
verts = np.column_stack([positions, normals, uv / 65535]).astype(float)
verts[:, 1] += .9
names, parents, pivots = [], [], []


def joint(name, parent, x, y, z):
    names.append(name)
    parents.append(parent)
    pivots.append(np.array([x, y - .9, z]))


joint("Hips", None, 0, .866, -.022)
joint("Spine", "Hips", 0, .984, -.010)
joint("Chest", "Spine", 0, 1.205, .002)
joint("Neck", "Chest", 0, 1.497, .021)
joint("Head", "Neck", -.002, 1.557, .025)
for side, s in (("L", 1), ("R", -1)):
    joint("Collar" + side, "Chest", s * .051, 1.419, .008)
    joint("Arm" + side, "Collar" + side, s * .181, 1.403, -.006)
    joint("Forearm" + side, "Arm" + side, s * .224, 1.158, -.020)
    joint("Hand" + side, "Forearm" + side, s * .236, .921, .049)
    joint("Thigh" + side, "Hips", s * .100, .862, -.023)
    joint("Shin" + side, "Thigh" + side, s * .121, .491, .027)
    joint("Foot" + side, "Shin" + side, .136 if s > 0 else -.166, .108, -.088)
    joint("Toe" + side, "Foot" + side, .169 if s > 0 else -.221, .046, .112)


def ease(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def seam(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    # Digit tips graze the trouser pockets. Both rolled sleeves are fused to the
    # jacket below the armpit in the scan. Trace the inner sleeve in each slice.
    h = [.703, .727, .766, .81, .885, .95, 1.03, 1.15, 1.25, 1.36, 1.45, 1.52]
    edge = np.interp(y, h, [.45, .185, .183, .179, .19, .190, .169, .147, .145, .145, .166, .33])
    cz = np.interp(y, [.72, .83, .94, 1.05, 1.16, 1.4], [.12, .084, .049, .004, -.015, -.021])
    return abs(x) - edge - .032 * ((z - cz) / .115) ** 2


def isolate_sleeves(vertices, triangles):
    # Where fingers and sleeves already have an air gap, respect the topology
    # of each horizontal contour. The body and cuff can overlap in front view.
    points, remap = np.unique(np.round(vertices[:, :3], 6), axis=0, return_inverse=True)
    indices = remap.ravel()[triangles]
    edges, edge_ids = np.unique(np.sort(indices[:, [[0, 1], [1, 2], [2, 0]]], axis=2).reshape(-1, 2),
                                axis=0, return_inverse=True)
    edge_ids = edge_ids.reshape(-1, 3)
    starts, ends = points[edges[:, 0]], points[edges[:, 1]]
    result = seam(vertices)
    for level in np.arange(.718, 1.325, .009):
        crossing = (starts[:, 1] < level) != (ends[:, 1] < level)
        use = np.flatnonzero(crossing)
        if not len(use):
            continue
        active = crossing[edge_ids]
        pairs = edge_ids[active].reshape(-1, 2)
        graph = {}
        for a, b in pairs:
            graph.setdefault(a, []).append(b)
            graph.setdefault(b, []).append(a)
        segments = []
        while graph:
            todo = [next(iter(graph))]; component = []
            while todo:
                k = todo.pop()
                if k in graph:
                    component.append(k); todo.extend(graph.pop(k))
            segments.append(np.array(component))
        cuts = np.zeros((len(edges), 2))
        t = ((level - starts[use, 1]) / (ends[use, 1] - starts[use, 1]))[:, None]
        cuts[use] = (starts[use] + t * (ends[use] - starts[use]))[:, [0, 2]]
        local = np.flatnonzero(np.abs(vertices[:, 1] - level) < .004501)
        if not len(local):
            continue
        mids = [cuts[seg, 0].mean() for seg in segments]
        separate = [abs(mid) > .168 and np.ptp(cuts[seg,0]) < .165 for mid,seg in zip(mids,segments)]
        full = [flag and np.ptp(cuts[seg,0]) > .049 and np.ptp(cuts[seg,1]) > .055
                for flag,seg in zip(separate,segments)]
        contour = np.array([np.min(((vertices[local][:, None, [0, 2]] - cuts[seg]) ** 2).sum(axis=2), axis=1)
                            for seg in segments]).argmin(axis=0)
        for s in (-1, 1):
            if not any(flag and mid * s > 0 for flag, mid in zip(full, mids)):
                continue
            for i, j in zip(local, contour):
                if s * vertices[i, 0] > 0 and abs(result[i]) < .039:
                    result[i] = max(.008, abs(result[i])) * (1 if separate[j] else -1)
    # Weld UV seams for the last surface-smoothing pass. Small hanging folds
    # belong to the surrounding sleeve even where a single slice closes around one.
    remap = remap.ravel()
    field = np.bincount(remap, weights=result) / np.bincount(remap)
    src, dst = np.r_[edges[:,0],edges[:,1]], np.r_[edges[:,1],edges[:,0]]
    conductance = 1/np.maximum(.004,np.linalg.norm(points[src]-points[dst],axis=1))
    total = np.bincount(src,weights=conductance)
    for i in range(4):
        neighbours = np.bincount(src,weights=conductance*field[dst])/total
        field = .60*field + .40*neighbours
    return field[remap]


field = isolate_sleeves(verts, faces)
albedo = np.asarray(Image.open(io.BytesIO(chunks[doc["images"][0]["bufferView"]])).convert("RGB")).astype(float)
skin_rgb = albedo[np.minimum((verts[:,7]*albedo.shape[0]).astype(int),albedo.shape[0]-1),
                  np.minimum((verts[:,6]*albedo.shape[1]).astype(int),albedo.shape[1]-1)]
r,g,b = skin_rgb.T
tips = ((verts[:,1]>.727) & (verts[:,1]<.794) & (abs(verts[:,0])>.165) & (verts[:,2]>.045)
        & (r>70) & (r-g>8) & (g-b>3))
field[tips] = np.maximum(field[tips],.016)
source_count = len(verts)
out = verts.tolist()
regions = (field > 0).tolist()
triangles, lining, intersections = [], [], {}


def append(v, sleeve):
    out.append(v.tolist())
    regions.append(sleeve)
    return len(out) - 1


def cut(i, j, sleeve):
    key = (min(i, j), max(i, j), sleeve)
    if key not in intersections:
        f = field[i] / (field[i] - field[j])
        v = verts[i] + f * (verts[j] - verts[i])
        v[3:6] /= max(.001, np.linalg.norm(v[3:6]))
        intersections[key] = append(v, sleeve)
    return intersections[key]


for face in faces.tolist():
    signs = [field[i] > 0 for i in face]
    if all(signs) or not any(signs):
        triangles.append(face)
        continue
    for sleeve in (False, True):
        poly = []
        for i, j in zip(face[-1:] + face[:-1], face):
            if (field[i] > 0) != (field[j] > 0):
                k = cut(i, j, sleeve)
                poly.append(k)
            if (field[j] > 0) == sleeve:
                poly.append(j)
        triangles.extend([poly[0], a, b] for a, b in zip(poly[1:], poly[2:]))


# The scan has no inner sleeve or flank where the two were fused. Reconstruct
# the missing cloth volume from transverse sections beneath the surviving outer
# fabric. Each closed lining belongs to exactly one side of the cut.
outer_count = len(out)
def garment(stations, side):
    sleeve = side != 0
    rows = np.array(stations)
    heights = np.unique(np.r_[rows[:, 0], np.arange(rows[0,0], rows[-1,0], .018)])
    first, cols = len(out), 28
    for h in heights:
        cx, cz, width, depth = (np.interp(h, rows[:,0], rows[:,i]) for i in range(1,5))
        for i in range(cols+1):
            u = i/cols; angle = (u-.5)*2*np.pi
            sx, sz = np.sin(angle), np.cos(angle)
            fold = .0023*np.sin(43*h+3*np.cos(angle))*np.cos(4*angle-h)
            add_x = (width+fold)*sx
            if sleeve:
                nudge = max(0, -side*sx)*.012*ease(h, 1.04, 1.17)
                add_x -= side*nudge
            n = np.array([sx,.028,sz])
            point = [cx*side+add_x, h, cz+(depth+fold)*sz, *(n/np.linalg.norm(n)),
                     u*.49 + (.503 if sleeve else .003), np.clip((1.46-h)/.76,.002,.998)]
            append(np.array(point), sleeve)
    for j in range(len(heights)-1):
        for i in range(cols):
            a = first+j*(cols+1)+i; b = a+cols+1
            lining.extend([[a,a+1,b], [b,a+1,b+1]])


garment([[.736,0,-.005,.135,.101],[.78,0,-.005,.167,.123],[.87,0,.004,.164,.130],
         [.925,0,.009,.155,.130],[.95,0,.007,.165,.143],[1.04,0,.008,.164,.145],
         [1.13,0,.003,.155,.137],[1.23,0,.009,.157,.137],[1.32,0,.003,.160,.132],
         [1.39,0,-.002,.167,.111],[1.44,0,.002,.157,.088],[1.49,0,0,.072,.062]], 0)
for side in (-1,1):
    garment([[.748,.209,.107,.014,.018],[.783,.229,.090,.029,.031],[.843,.234,.081,.030,.027],
             [.917,.235,.054,.023,.023],[.989,.236,.028,.028,.033],[1.026,.233,.012,.048,.045],
             [1.075,.224,.003,.052,.052],[1.148,.214,-.013,.051,.057],[1.216,.208,-.017,.055,.061],
             [1.288,.201,-.022,.058,.066],[1.363,.185,-.015,.061,.068],[1.423,.167,-.008,.061,.057],
             [1.455,.147,-.012,.039,.040]], side)

out = np.array(out)
x, y, z = out[:, :3].T
weights = np.zeros((len(out), len(names)))


def add(name, value):
    weights[:, names.index(name)] += value


shoulder = ease(seam(out), -.075, .058)
shoulder_mix = ease(y, 1.241, 1.347)
arm = (np.array(regions) * (1 - shoulder_mix) + shoulder * shoulder_mix) * (1 - ease(y, 1.43, 1.515))
core = 1 - arm
leg = core * (1 - ease(y, .733, .979))
body = core - leg
spine = ease(y, .908, 1.109)
chest = ease(y, 1.13, 1.302)
neck = ease(y + .18 * z, 1.476, 1.546)
head = ease(y + .25 * z, 1.536, 1.569)
add("Hips", body * (1 - spine))
add("Spine", body * spine * (1 - chest))
add("Chest", body * spine * chest * (1 - neck) * (1 - head))
add("Neck", body * spine * chest * neck * (1 - head))
add("Head", body * head)
# Welded inner thighs meet at 0.71 m. Widen the blend below the crotch so
# adjacent triangles cannot jump from one hip to the other during a side kick.
soft = .006 + .076 * ease(y, .555, .750)
left = ease(x-.0025, -soft, soft)
for side, s in (("L", 1), ("R", -1)):
    a = arm * (s * x > 0)
    collar = ease(y, 1.366, 1.453) * (1 - ease(abs(x), .118, .227))
    fore = 1 - ease(y, 1.079, 1.224)
    hand = 1 - ease(y, .884, .961)
    add("Collar" + side, a * collar)
    add("Arm" + side, a * (1 - collar) * (1 - fore))
    add("Forearm" + side, a * fore * (1 - hand))
    add("Hand" + side, a * hand)
    l = leg * (left if s > 0 else 1 - left)
    shin = 1 - ease(y, .394, .588)
    foot = 1 - ease(y, .121, .193)
    toe = ease(z + .22 * (s * x - .16), .075, .148)
    add("Thigh" + side, l * (1 - shin))
    add("Shin" + side, l * shin * (1 - foot))
    add("Foot" + side, l * foot * (1 - toe))
    add("Toe" + side, l * foot * toe)

ids = np.argsort(-weights, axis=1)[:, :4]
values = np.take_along_axis(weights, ids, axis=1)
values = np.rint(255 * values / values.sum(axis=1, keepdims=True)).astype(int)
values[:, 0] += 255 - values.sum(axis=1)
assert min(values.ravel()) >= 0 and max(ids.ravel()) < 256 and outer_count < 65536
out[:, 1] -= .9
attrs = {}
outer = out[:outer_count]
for i, data in enumerate((outer[:, :3].astype("<f4"), outer[:, 3:6].astype("<f4"),
                          np.rint(outer[:, 6:8] * 65535).astype("<u2"))):
    a = dict(doc["accessors"][i])
    # Extend these three views. The original static scene still addresses only its
    # original vertices, while the skin can address the additional seam vertices.
    chunks[a["bufferView"]] = chunks[a["bufferView"]][:source_count * data.itemsize * data.shape[1]] + data[source_count:].tobytes()
    a["count"] = len(data)
    attrs[["POSITION", "NORMAL", "TEXCOORD_0"][i]] = len(doc["accessors"])
    doc["accessors"].append(a)
attrs["JOINTS_0"] = accessor(ids[:outer_count].astype("u1"), 5121, "VEC4")
attrs["WEIGHTS_0"] = accessor(values[:outer_count].astype("u1"), 5121, "VEC4", True)
idx = accessor(np.array(triangles, dtype="<u2").ravel(), 5123, "SCALAR")
primitives = [{"attributes": attrs, "indices": idx, "material": 0}]
# Independent woven underarm facings. UVs from opposite sides of a cut do
# not belong to one chart; extending those UVs across it produces striped spikes.
rim, remap = np.unique(np.array(lining), return_inverse=True)
parts = out[rim]
details = Image.open(ROOT / "src/courier-details.webp").convert("RGB")
chart = Image.new("RGB", (384, 512))
def cloth(x, y0, y1, crop):
    top, end = (int(round((1.46-h)/.76*512)) for h in (y1,y0))
    chart.paste(details.crop(crop).resize((192, end-top)), (x,top))
cloth(0,.70,.925,(554,34,688,281))
jacket = Image.open(ROOT/'src/courier-jacket.webp').convert("RGB")
chart.paste(jacket.resize((192,361)),(0,0))
cloth(192,.71,.919,(552,110,700,302));cloth(192,.919,1.014,(535,28,548,170))
cloth(192,1.014,1.157,(323,47,474,309));cloth(192,1.157,1.46,(27,29,155,311))
packed = io.BytesIO()
chart.save(packed, "JPEG", quality=90)
doc["images"].append({"bufferView": len(chunks), "mimeType":"image/jpeg"})
doc["textures"].append({"source": len(doc["images"])-1})
chunks.append(packed.getvalue()); doc["bufferViews"].append({"buffer":0})
lining_attrs = {"POSITION": accessor(parts[:, :3].astype("<f4"), 5126, "VEC3"),
                "NORMAL": accessor(parts[:, 3:6].astype("<f4"), 5126, "VEC3"),
                "TEXCOORD_0": accessor(np.rint(parts[:, 6:8]*65535).astype("<u2"), 5123, "VEC2", True),
                "JOINTS_0": accessor(ids[rim].astype("u1"), 5121, "VEC4"),
                "WEIGHTS_0": accessor(values[rim].astype("u1"), 5121, "VEC4", True)}
doc["accessors"][lining_attrs["POSITION"]].update(min=parts[:, :3].min(axis=0).tolist(),
                                                  max=parts[:, :3].max(axis=0).tolist())
doc["materials"].append({"name": "SewnUnderarm", "doubleSided": True,
                         "pbrMetallicRoughness": {"baseColorTexture":{"index":2},
                             "baseColorFactor":[.81,.80,.77,1],"metallicFactor": 0, "roughnessFactor": .92}})
primitives.append({"attributes": lining_attrs, "indices": accessor(remap.astype("<u2").ravel(), 5123, "SCALAR"),
                   "material": 1})
doc["meshes"].append({"name": "CourierPerformance", "primitives": primitives})
doc["nodes"].append({"name": "CourierPerformance", "mesh": 2, "skin": 0})
first = len(doc["nodes"])
inverses = []
for j, (name, parent, pivot) in enumerate(zip(names, parents, pivots)):
    offset = pivot - pivots[names.index(parent)] if parent else pivot
    node = {"name": name, "translation": offset.round(6).tolist()}
    children = [first + i for i, p in enumerate(parents) if p == name]
    if children:
        node["children"] = children
    doc["nodes"].append(node)
    mat = np.eye(4, dtype="<f4")
    mat[3, :3] = -pivot
    inverses.append(mat)
doc["skins"] = [{"name": "CourierSkeleton", "skeleton": first,
                 "joints": list(range(first, first + len(names))),
                 "inverseBindMatrices": accessor(np.array(inverses), 5126, "MAT4")}]
doc["scenes"].append({"name": "CourierPerformanceScene", "nodes": [2, first]})
payload = bytearray()
for view, chunk in zip(doc["bufferViews"], chunks):
    payload += bytes(-len(payload) % 4)
    view.update(byteOffset=len(payload), byteLength=len(chunk))
    payload += chunk
doc["buffers"] = [{"byteLength": len(payload)}]
payload += bytes(-len(payload) % 4)
encoded = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
encoded += b" " * (-len(encoded) % 4)
result = (struct.pack("<4sIIII", b"glTF", 2, 28 + len(encoded) + len(payload), len(encoded), 0x4e4f534a)
          + encoded + struct.pack("<I4s", len(payload), b"BIN\0") + payload)
MODEL.write_bytes(result)
record = manifest["courier"]
record.update(bytes=len(result), sha256=hashlib.sha256(result).hexdigest())
record["textures"] = record["textures"][:2] + [{"role":"underarmBaseColor",
    "size":list(chart.size), "bytes":len(packed.getvalue()), "source":"existing courier garment charts"}]
record["models"]["CourierPerformance"] = dict(record["models"]["CourierStanding"],
    vertices=outer_count+len(parts), triangles=len(triangles)+len(lining), joints=len(names), maxInfluences=4)
manifest_file.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
