"""Build the pre-rig Aholo base meshes from the three archived source GLBs."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art" / "Lux3D" / "assets"
OUTPUT = ROOT / "art" / "build" / "lux-base"
PORTRAIT = ROOT / "art" / "reference" / "骑手与鬼火-骑姿与正背设定.png"
# The neck, steering head and axle cuts below are calibrated to these exact exports.
SOURCES = {
    "courier": (8438124, "651e3ba647ab129a0b3ff3d2f1034048c1d74f5170679b49c812e294d74844f7"),
    "scooter": (8438123, "6b903d31e734fe22d5bac1793f636e49dd6d30da977cabbc761c319d95406c75"),
    "flat": (8438125, "77f403edbb30cc2a15a3e248ab8d7017439aa595800ee881f69043695834da4c"),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


class SourceGLB:
    def __init__(self, data):
        magic, version, length = struct.unpack_from("<4sII", data)
        json_size, json_type = struct.unpack_from("<I4s", data, 12)
        bin_size, bin_type = struct.unpack_from("<I4s", data, 20 + json_size)
        if (magic, version, length, json_type, bin_type) != (b"glTF", 2, len(data), b"JSON", b"BIN\0"):
            raise ValueError("Invalid or incomplete GLB")
        self.doc = json.loads(data[20:20 + json_size])
        self.binary = data[28 + json_size:]
        if bin_size != len(self.binary) or len(self.doc["buffers"]) != 1:
            raise ValueError("Expected one complete embedded buffer")
        if any("uri" in item for item in self.doc["buffers"] + self.doc["images"]):
            raise ValueError("Expected embedded images and geometry")

    def view(self, index):
        view = self.doc["bufferViews"][index]
        start = view.get("byteOffset", 0)
        return self.binary[start:start + view["byteLength"]]

    def accessor(self, index):
        a = self.doc["accessors"][index]
        dtype = np.dtype({5126: "<f4", 5125: "<u4", 5123: "<u2"}[a["componentType"]])
        columns = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
        view = self.doc["bufferViews"][a["bufferView"]]
        stride = view.get("byteStride", dtype.itemsize * columns)
        return np.ndarray((a["count"], columns), dtype, self.view(a["bufferView"]),
                          a.get("byteOffset", 0), (stride, dtype.itemsize))

    def mesh(self):
        mesh, = self.doc["meshes"]
        primitive, = mesh["primitives"]
        node, = [n for n in self.doc["nodes"] if "mesh" in n]
        if any(k in node for k in ("matrix", "scale", "rotation", "translation")):
            raise ValueError("Calibrated geometry expects identity node transforms")
        attrs = primitive["attributes"]
        vertices = np.column_stack([self.accessor(attrs[k]) for k in ("POSITION", "NORMAL", "TEXCOORD_0")])
        faces = self.accessor(primitive["indices"]).astype(np.int32).reshape(-1, 3)
        return vertices, faces


def clipped(vertices, faces, field):
    """Keep the positive surface. Interpolate UVs and normals on every cut edge."""
    tri_field = field[faces]
    kept = faces[np.all(tri_field >= 0, axis=1)].tolist()
    border = []
    edge_vertices = {}

    def crossing(a, b):
        edge = tuple(sorted((a, b)))
        if edge not in edge_vertices:
            t = field[a] / (field[a] - field[b])
            v = vertices[a] + t * (vertices[b] - vertices[a])
            v[3:6] /= max(1e-10, np.linalg.norm(v[3:6]))
            edge_vertices[edge] = len(vertices) + len(border)
            border.append(v)
        return edge_vertices[edge]

    crossing_faces = (tri_field.min(axis=1) < 0) & (tri_field.max(axis=1) >= 0)
    for face in faces[crossing_faces].tolist():
        polygon = []
        for a, b in zip(face[-1:] + face[:-1], face):
            if (field[a] >= 0) != (field[b] >= 0):
                polygon.append(crossing(a, b))
            if field[b] >= 0:
                polygon.append(b)
        for i in range(1, len(polygon) - 1):
            kept.append([polygon[0], polygon[i], polygon[i + 1]])
    used, indices = np.unique(np.asarray(kept, dtype=np.int32), return_inverse=True)
    return np.vstack((vertices, border))[used], indices.reshape(-1, 3)


def ramp(lo, hi, values):
    t = np.clip((values - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def restore_face_detail(atlas, vertices, faces):
    """Bake the approved portrait into front-facing skin texels of the supplied UV atlas."""
    with Image.open(PORTRAIT) as drawing:
        portrait = np.array(drawing.crop((985, 34, 1130, 195)).convert("RGB").resize(
            (400, 450), Image.Resampling.BICUBIC))
    source_pixels = np.asarray(atlas)
    pixels = source_pixels.copy()
    # Landmarks on the orthographic +Z view of the raw mesh: brow, eyes,
    # nose, lips and jaw. The raised visor and the profile keep the Lux atlas.
    rows = [146, 163, 187, 207, 240, 265, 292, 324, 352, 380, 388]
    ref_y = [146, 162, 189, 217, 239, 254, 272, 290, 319, 345, 353]
    face_mid = [181, 181, 183, 185, 179, 174, 176, 179, 180, 181, 181]
    ref_mid = [207, 207, 208, 209, 210, 211, 213, 214, 216, 218, 218]
    left = [161, 128, 103, 96, 100, 102, 105, 110, 113, 125, 140]
    right = [201, 227, 247, 258, 269, 274, 271, 262, 248, 224, 207]
    height, width = pixels.shape[:2]
    uv = vertices[:, 6:8] * [width, height] - .5
    # Increasing alpha also dilates edge colours across UV chart seams for mipmaps.
    painted = np.zeros((height, width), dtype=np.float32)
    for face in faces:
        tri = vertices[face]
        if tri[:, 1].max() < .638 or tri[:, 1].min() > .815 or tri[:, 2].max() < .034:
            continue
        a, b, c = uv[face]
        lo = np.maximum(0, np.floor(np.minimum.reduce([a, b, c])).astype(int) - 2)
        hi = np.minimum([width, height], np.ceil(np.maximum.reduce([a, b, c])).astype(int) + 3)
        X, Y = np.meshgrid(np.arange(lo[0], hi[0]), np.arange(lo[1], hi[1]))
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-7:
            continue
        wa = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / det
        wb = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / det
        wc = 1 - wa - wb
        edge = np.minimum.reduce([wa * abs(det) / max(.001, np.linalg.norm(b-c)),
                                  wb * abs(det) / max(.001, np.linalg.norm(a-c)),
                                  wc * abs(det) / max(.001, np.linalg.norm(a-b))])
        X, Y = X[edge > -1.75], Y[edge > -1.75]
        if not len(X):
            continue
        weights = np.column_stack([wa[edge > -1.75], wb[edge > -1.75], wc[edge > -1.75]])
        surface = weights @ tri
        x = (surface[:, 0] + .14) * (399 / .28)
        y = (.915 - surface[:, 1]) * (449 / .315)
        opacity = (.94 * ramp(146, 166, y) * (1-ramp(365, 386, y)) *
                   ramp(0, 14, x-np.interp(y, rows, left)) * ramp(0, 14, np.interp(y, rows, right)-x) *
                   ramp(.033, .073, surface[:, 2]) * ramp(-.26, .19, surface[:, 5]))
        px = np.clip(np.interp(y, rows, ref_mid) + .90 * (x-np.interp(y, rows, face_mid)), 0, 398.99)
        py = np.clip(np.interp(y, rows, ref_y), 0, 448.99)
        ix, iy = px.astype(int), py.astype(int)
        dx, dy = (px-ix)[:, None], (py-iy)[:, None]
        color = ((1-dy) * ((1-dx)*portrait[iy, ix] + dx*portrait[iy, ix+1]) +
                 dy * ((1-dx)*portrait[iy+1, ix] + dx*portrait[iy+1, ix+1]))
        coverage = opacity * ramp(-1.75, 0, edge[edge > -1.75])
        use = coverage > painted[Y, X]
        X, Y = X[use], Y[use]
        if len(X):
            mix = opacity[use, None]
            pixels[Y, X] = ((1-mix)*source_pixels[Y, X] + mix*color[use]).round().astype(np.uint8)
            painted[Y, X] = coverage[use]
    return Image.fromarray(pixels)


def scooter_body(vertices, faces):
    # Source side elevation: X points at the headlamp. Trace the floor, tail and
    # fixed apron at their mechanical seams. Leave the kickstand and the entire
    # steered assembly on the parked variant. The rear drive is outside the tyre.
    x, y, z = vertices[:, :3].T
    floor = np.interp(x, [-.9, -.72, -.51, -.40, -.30, -.21, -.13, .35],
                      [-.145, -.18, -.19, -.215, -.295, -.39, -.528, -.55])
    apron = np.interp(y, [-.75, -.49, -.30, -.11, .00, .35],
                      [.23, .33, .45, .553, .63, .67])
    fixed = np.minimum.reduce([y - floor, apron - x, .354 - y])
    # The spring and swingarm meet the existing rear hub at the original axle.
    spring_x = -.573 + .35 * (y + .475)
    spring = np.minimum.reduce([.056 - np.abs(x - spring_x), y + .565, -.065 - y])
    arm = np.minimum.reduce([x + .645, -.165 - x, y + .558, -.392 - y,
                             np.maximum(-.30 - x, y + .464)])
    outboard = np.minimum(np.maximum(spring, arm), np.abs(z) - .099)
    # The original rear splashguard is clear of the rotating tyre.
    mudguard = np.minimum.reduce([x + .888, -.62 - x, y + .376,
                                  (-.672 + .49 * (y + .08)) - x, -.02 - y])
    part, indices = clipped(vertices, faces, np.maximum.reduce([fixed, outboard, mudguard]))

    def to_chassis(points):
        x, y, z = points.T
        tail = 1 - ramp(-.54, -.22, x)
        rack = .076 + .030 * ramp(-.42, .05, y)
        steer_neck = .113 * ramp(.11, .28, x) * ramp(-.22, .31, y)
        joint = .016 * ramp(.12, .32, y) * ramp(.10, .22, x)
        return np.column_stack((-z * .94, y * .90 + .644 + tail * rack + joint,
                                (x - .053) * 1.135 + steer_neck))

    # Transport the authored smooth normals through the seat/rack fit.
    points = part[:, :3].astype(np.float64)
    step = 1e-5
    jacobian = np.stack([(to_chassis(points + axis * step) - to_chassis(points - axis * step)) / (2 * step)
                         for axis in np.eye(3)], axis=-1)
    normals = np.linalg.solve(jacobian.transpose(0, 2, 1), part[:, 3:6, None])[:, :, 0]
    part[:, :3] = to_chassis(points)
    part[:, 3:6] = normals / np.maximum(1e-8, np.linalg.norm(normals, axis=1, keepdims=True))
    return part, indices


class OutputGLB:
    def __init__(self, material, key, source_hash):
        self.binary = bytearray()
        self.doc = {
            "asset": {"version": "2.0", "generator": "Day 1 local preparation",
                      "extras": {"source": key + ".glb", "task": SOURCES[key][0], "sourceSHA256": source_hash}},
            "scene": 0, "scenes": [], "nodes": [], "meshes": [], "accessors": [], "bufferViews": [],
            "materials": [material], "textures": [], "images": [],
        }

    def view(self, data, target=None):
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        view = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.doc["bufferViews"].append(view)
        self.binary.extend(data)
        return len(self.doc["bufferViews"]) - 1

    def accessor(self, array, kind, component, normalized=False):
        index = self.view(array.tobytes(order="C"), 34963 if kind == "SCALAR" else 34962)
        a = {"bufferView": index, "componentType": component, "count": len(array), "type": kind}
        if normalized:
            a["normalized"] = True
        self.doc["accessors"].append(a)
        return len(self.doc["accessors"]) - 1

    def model(self, name, vertices, faces):
        position = vertices[:, :3].astype("<f4")
        normal = vertices[:, 3:6].astype("<f4")
        uv = np.rint(np.clip(vertices[:, 6:8], 0, 1) * 65535).astype("<u2")
        attr = {"POSITION": self.accessor(position, "VEC3", 5126),
                "NORMAL": self.accessor(normal, "VEC3", 5126),
                "TEXCOORD_0": self.accessor(uv, "VEC2", 5123, normalized=True)}
        pos = self.doc["accessors"][attr["POSITION"]]
        pos.update(min=position.min(axis=0).tolist(), max=position.max(axis=0).tolist())
        small = len(vertices) <= 65535
        index = self.accessor(faces.ravel().astype("<u2" if small else "<u4"), "SCALAR", 5123 if small else 5125)
        n = len(self.doc["nodes"])
        self.doc["meshes"].append({"name": name, "primitives": [{"attributes": attr, "indices": index, "material": 0}]})
        self.doc["nodes"].append({"name": name, "mesh": n})
        self.doc["scenes"].append({"name": name + "Scene", "nodes": [n]})
        return {"vertices": len(position), "triangles": len(faces), "min": pos["min"], "max": pos["max"]}

    def image(self, data, mime):
        i = len(self.doc["images"])
        self.doc["images"].append({"bufferView": self.view(data), "mimeType": mime})
        self.doc["textures"].append({"source": i})

    def finish(self):
        self.doc["buffers"] = [{"byteLength": len(self.binary)}]
        metadata = json.dumps(self.doc, separators=(",", ":"), allow_nan=False).encode()
        metadata += b" " * (-len(metadata) % 4)
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        return (struct.pack("<4sIIII", b"glTF", 2, 28 + len(metadata) + len(self.binary), len(metadata), 0x4E4F534A)
                + metadata + struct.pack("<I4s", len(self.binary), b"BIN\0") + self.binary)


def convert(key, original, geometry):
    source_hash = digest(original)
    parsed = SourceGLB(original)
    material, = parsed.doc["materials"]
    output = OutputGLB(material, key, source_hash)
    pbr = material["pbrMetallicRoughness"]
    if key == "courier":
        # The supplied blue channel labels even skin as predominantly metal.
        # Keep its authored variation on the visor hardware; the painted shell,
        # face and jacket need diffuse response under the game's hemisphere light.
        pbr["metallicFactor"] = .08
    if material.get("alphaMode", "OPAQUE") != "OPAQUE" or [
        pbr["baseColorTexture"]["index"], pbr["metallicRoughnessTexture"]["index"]
    ] != [0, 1]:
        raise ValueError("Unexpected material or texture layout")
    vertices, faces = geometry.mesh()
    textures = []
    for i, tex in enumerate(parsed.doc["textures"]):
        source = parsed.doc["images"][tex["source"]]
        image_data = parsed.view(source["bufferView"])
        with Image.open(io.BytesIO(image_data)) as decoded:
            size = list(decoded.size)
            rgb = decoded.convert("RGB")
        if key == "courier" and i == 0:
            rgb = restore_face_detail(rgb, vertices, faces)
        limit = (2048 if key == "courier" else 1536) if i == 0 else (768 if key == "courier" else 512)
        rgb.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        encoded = io.BytesIO()
        if i == 0:
            rgb.save(encoded, "JPEG", quality=88, subsampling=0, optimize=True)
        else:
            rgb.save(encoded, "PNG", optimize=True)
        payload = encoded.getvalue()
        output.image(payload, "image/jpeg" if i == 0 else "image/png")
        textures.append({"role": "baseColor" if i == 0 else "metallicRoughness",
                         "sourceSize": size, "size": list(rgb.size), "bytes": len(payload)})
    names = {"courier": "CourierStanding", "scooter": "ScooterParked", "flat": "FlatModule"}
    models = {names[key]: output.model(names[key], vertices, faces)}
    if key == "courier":
        output.doc["asset"]["extras"]["faceDetail"] = {
            "reference": PORTRAIT.relative_to(ROOT).as_posix(), "sha256": digest(PORTRAIT.read_bytes()),
            "application": "front-facing skin texels in the supplied UV atlas",
        }
        # Slightly oblique through the neck: retain the chin and raised visor;
        # the rear of the hood belongs to the local articulated jacket.
        head = clipped(vertices, faces, vertices[:, 1] + .25 * vertices[:, 2] - .659)
        models["CourierHead"] = output.model("CourierHead", *head)
    if key == "scooter":
        models["ScooterChassis"] = output.model("ScooterChassis", *scooter_body(vertices, faces))
    data = output.finish()
    return data, {"task": SOURCES[key][0], "source": f"art/Lux3D/assets/{key}-original/glb.glb",
                  "sourceBytes": len(original), "sourceSHA256": source_hash,
                  "sourceTriangles": len(parsed.mesh()[1]), "product": key + ".glb",
                  "bytes": len(data), "sha256": digest(data), "textures": textures, "models": models,
                  **({"faceDetail": output.doc["asset"]["extras"]["faceDetail"]} if key == "courier" else {})}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blender", help="Path to the local Blender executable")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT, help="Directory for intermediate meshes before rigging")
    args = parser.parse_args()
    blender = args.blender or os.environ.get("BLENDER_BIN") or shutil.which("blender")
    originals = {key: (SOURCE / (key+"-original") / "glb.glb").read_bytes() for key in SOURCES}
    for key, raw in originals.items():
        if digest(raw) != SOURCES[key][1]:
            raise ValueError(f"{key}: source hash differs from the calibrated download")
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output) as staging:
        stage = Path(staging)
        reduced = stage / "residential-intermediate.glb"
        if blender:
            subprocess.run([blender, "--background", "--factory-startup", "--offline-mode", "--disable-autoexec",
                            "--python-exit-code", "1", "--python", str(Path(__file__).with_name("prepare-lux-blender.py")),
                            "--", str(SOURCE / "flat-original" / "glb.glb"), str(reduced)], check=True)
        manifest = {}
        for key, original in originals.items():
            geometry = SourceGLB(reduced.read_bytes() if key == "flat" and reduced.exists() else original)
            data, manifest[key] = convert(key, original, geometry)
            (stage / (key + ".glb")).write_bytes(data)
            print(f"{key}: {len(original):,} -> {len(data):,} bytes", flush=True)
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
        for name in [key + ".glb" for key in SOURCES] + ["manifest.json"]:
            os.replace(stage / name, output / name)


if __name__ == "__main__":
    main()
