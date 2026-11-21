"""Blender --background --python scripts/refine-courier-knees.py -- [--review]

Author two knee corrections on the shipped bind mesh. Preserve the original
vertex order, armature, UVs and byte-normalized thigh/shin weight budget.
"""
import hashlib
import json
import math
import os
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art/Lux3D/assets/courier-rigged-baseline/glb.glb"
PRODUCT = ROOT / "src/assets/aholo/courier.glb"
OUT = ROOT / "src/courier-sole-profile.js"
EVIDENCE = ROOT / "artifacts/11月21日发布/动作/Blender制作"
raw = SOURCE.read_bytes()
source_hash = hashlib.sha256(raw).hexdigest()
if source_hash != "5436f606f4b67c2839b16de68bad87c4e8f5690cadb56c704a9c0bd93ed8ad07":
    raise ValueError("Unexpected rigged baseline. The vertex order is part of the bake.")
length = struct.unpack_from("<I", raw, 12)[0]
gltf = json.loads(raw[20:20 + length])
binary = memoryview(raw)[28 + length:]
skin = gltf["skins"][0]
names = [gltf["nodes"][n]["name"] for n in skin["joints"]]
nodes = gltf["nodes"]
parents = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
locations = {}
for i in skin["joints"]:
    parent = parents.get(i)
    locations[i] = Vector(nodes[i]["translation"]) + locations.get(parent, Vector((0, 0, 0)))


def accessor(i):
    a = gltf["accessors"][i]
    view = gltf["bufferViews"][a["bufferView"]]
    size = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[a["type"]]
    fmt = "<" + {5126: "f", 5121: "B", 5123: "H", 5125: "I"}[a["componentType"]] * size
    offset = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = view.get("byteStride", struct.calcsize(fmt))
    return [struct.unpack_from(fmt, binary, offset + j * stride) for j in range(a["count"])]


def blender(v):
    return Vector((v[0], -v[2], v[1]))


def smooth(low, high, value):
    t = min(1, max(0, (value-low)/(high-low)))
    return t*t*(3-2*t)


bpy.ops.wm.read_factory_settings(use_empty=True)
primitive = next(m for m in gltf["meshes"] if m["name"] == "CourierPerformance")["primitives"][0]
attr = primitive["attributes"]
points, joints, weights = [accessor(attr[k]) for k in ("POSITION", "JOINTS_0", "WEIGHTS_0")]
indices = [v[0] for v in accessor(primitive["indices"])]
mesh = bpy.data.meshes.new("CourierPerformance · 原顶点序")
mesh.from_pydata([blender(p) for p in points], [], list(zip(indices[::3], indices[1::3], indices[2::3])))
mesh.update()
mesh.polygons.foreach_set("use_smooth", [True]*len(mesh.polygons))
body = bpy.data.objects.new("冻结 · 髌前与腘窝", mesh)
bpy.context.collection.objects.link(body)
groups = [body.vertex_groups.new(name=n) for n in names]
for i, (js, ws) in enumerate(zip(joints, weights)):
    for j, w in zip(js, ws):
        if w:
            groups[j].add([i], w/255, "REPLACE")

review = "--review" in sys.argv
if review:
    original = body.copy()
    original.data = body.data.copy()
    original.name = "基线 · 相同屈膝"
    bpy.context.collection.objects.link(original)
body.shape_key_add(name="Basis")
keys = {s: body.shape_key_add(name="Kneecap"+s) for s in ("R", "L")}
records = bytearray()
audit = {}
boots = []
hulls = []
for s, sign in [("R", -1), ("L", 1)]:
    thigh, shin = (names.index(n+s) for n in ("Thigh", "Shin"))
    knee = locations[skin["joints"][shin]]
    foot = locations[skin["joints"][names.index("Foot"+s)]]
    socket = foot + Vector((0, -.108, .096))
    bands = {}
    changed = reweighted = 0
    max_delta = 0
    for i, (p, js, ws) in enumerate(zip(points, joints, weights)):
        x, y, z = p
        if x*sign <= 0:
            continue
        if y < -.738:
            # Lower envelopes of 24 mm longitudinal strips, in socket space.
            # The extremal X/Z values also cover each sole's asymmetric flare.
            v = Vector(p)-socket
            band = bands.setdefault(math.floor(v.z/.024), [])
            band.append(v)
        if thigh not in js or shin not in js:
            continue
        a, b = ws[js.index(thigh)], ws[js.index(shin)]
        if min(a, b) <= 0 or a+b != 255:
            continue
        band = 1-smooth(.018, .103, abs(y-knee.y))
        if not band:
            continue
        front = smooth(-.020, .083, z-knee.z)
        back = 1-smooth(-.085, -.010, z-knee.z)
        # The front trouser panel follows the femur over the patella. The
        # popliteal fold behind it follows the shin a little sooner.
        new_shin = max(1, min(254, round(b+band*(18*back-31*front))))
        groups[shin].add([i], new_shin/255, "REPLACE")
        groups[thigh].add([i], (255-new_shin)/255, "REPLACE")
        # Restore some anterior/lateral volume lost in linear-blend flexion.
        dx = max(-1, min(1, (x-knee.x)/.081))*.007*band*(.55+.45*front)
        dz = .021*front*band
        keys[s].data[i].co = mesh.vertices[i].co + blender((dx,0,dz))
        delta = keys[s].data[i].co - mesh.vertices[i].co
        dxq, dzq = round(delta.x*4000), round(-delta.y*4000)
        keys[s].data[i].co = mesh.vertices[i].co + blender((dxq/4000,0,dzq/4000))
        baked = round(groups[shin].weight(i)*255)
        assert round(groups[thigh].weight(i)*255) + baked == 255
        if baked == b and dxq == 0 and dzq == 0:
            continue
        records += struct.pack("<HBbb", i, baked, dxq, dzq)
        changed += 1
        reweighted += baked != b
        max_delta = max(max_delta, math.hypot(dxq,dzq)/4000)
    boots.append([[round(f,5) for f in (
        min(p.x for p in vs),max(p.x for p in vs),min(p.y for p in vs),
        min(p.z for p in vs),max(p.z for p in vs))] for _, vs in sorted(bands.items())])
    # Exact lower convex hull in longitudinal section for a sole on one plane.
    hull = []
    for point in sorted({(round(v.z,6),round(v.y,6)) for vs in bands.values() for v in vs}):
        while len(hull) >= 2:
            a, b = hull[-2:]
            if (b[0]-a[0])*(point[1]-a[1]) > (b[1]-a[1])*(point[0]-a[0]):
                break
            hull.pop()
        hull.append(point)
    hulls.append(hull)
    audit[s] = {"affected":changed, "weightChanged":reweighted, "maxCorrectiveM":round(max_delta,5)}

OUT.write_text("// Boot geometry baked by scripts/refine-courier-knees.py from " + source_hash +
               "\nexport const bootBands = " + json.dumps(boots,separators=(",",":")) +
               ";\nexport const soleHulls = " + json.dumps(hulls,separators=(",",":")) +
               ";\n",encoding="utf-8",newline="\n")

# Preserve all original GLB scenes, bindings, texture payloads and vertex order.
# Only WEIGHTS_0 in the primary performance primitive is patched in place.
payload = bytearray(binary)
weight_accessor = gltf["accessors"][attr["WEIGHTS_0"]]
weight_view = gltf["bufferViews"][weight_accessor["bufferView"]]
start = weight_view.get("byteOffset",0) + weight_accessor.get("byteOffset",0)
stride = weight_view.get("byteStride",4)
shapes = [[],[]]
for index, shin_byte, dxq, dzq in struct.iter_unpack("<HBbb",records):
    side = int(points[index][0] > 0)
    suffix = "L" if side else "R"
    slots = joints[index]
    payload[start+index*stride+slots.index(names.index("Shin"+suffix))] = shin_byte
    payload[start+index*stride+slots.index(names.index("Thigh"+suffix))] = 255-shin_byte
    if dxq or dzq:
        shapes[side].append((index,(dxq/4000,0,dzq/4000)))


def view(data):
    payload.extend(b"\0"*((-len(payload))%4))
    result = len(gltf["bufferViews"])
    gltf["bufferViews"].append({"buffer":0, "byteOffset":len(payload), "byteLength":len(data)})
    payload.extend(data)
    return result


def position_deltas(count, entries):
    values = [(0,0,0),*[v for _,v in entries]]
    accessor = {"componentType":5126, "type":"VEC3", "count":count,
                "min":list(map(min,zip(*values))), "max":list(map(max,zip(*values)))}
    if entries:
        accessor["sparse"] = {"count":len(entries),
            "indices":{"bufferView":view(b"".join(struct.pack("<H",i) for i,_ in entries)), "componentType":5123},
            "values":{"bufferView":view(b"".join(struct.pack("<3f",*v) for _,v in entries))}}
    result = len(gltf["accessors"])
    gltf["accessors"].append(accessor)
    return {"POSITION":result}


performer = next(m for m in gltf["meshes"] if m["name"]=="CourierPerformance")
performer.setdefault("extras",{})["targetNames"] = ["KneecapR","KneecapL"]
performer["weights"] = [0,0]
for primitive_index, part in enumerate(performer["primitives"]):
    count = gltf["accessors"][part["attributes"]["POSITION"]]["count"]
    part["targets"] = [position_deltas(count, entries if primitive_index==0 else []) for entries in shapes]
gltf["buffers"][0]["byteLength"] = len(payload)
payload.extend(b"\0"*((-len(payload))%4))
metadata = json.dumps(gltf,ensure_ascii=False,separators=(",",":")).encode("utf-8")
metadata += b" "*((-len(metadata))%4)
product = (struct.pack("<4sII",b"glTF",2,28+len(metadata)+len(payload))
           + struct.pack("<I4s",len(metadata),b"JSON") + metadata
           + struct.pack("<I4s",len(payload),b"BIN\0") + payload)
temporary = PRODUCT.with_suffix(f".{os.getpid()}.tmp")
temporary.write_bytes(product)
temporary.replace(PRODUCT)
EVIDENCE.mkdir(parents=True, exist_ok=True)
report = {"source":SOURCE.relative_to(ROOT).as_posix(),"sourceSHA256":source_hash,
          "product":PRODUCT.relative_to(ROOT).as_posix(),"bytes":len(product),
          "outputSHA256":hashlib.sha256(product).hexdigest(),"profileSHA256":hashlib.sha256(OUT.read_bytes()).hexdigest(),
          "blender":bpy.app.version_string, "vertices":len(points), "bones":names,
          "recordBytes":len(records), "perKnee":audit, "soleBands":[len(s) for s in boots]}

if review:
    # The armature is reconstructed from the shipped joint centres. World-space
    # flexion is identical for both meshes, independent of Blender bone roll.
    arm = bpy.data.armatures.new("CourierSkeleton")
    rig = bpy.data.objects.new("原有 21 骨", arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for i in skin["joints"]:
        name = nodes[i]["name"]
        bone = arm.edit_bones.new(name)
        bone.head = blender(locations[i])
        children = nodes[i].get("children",[])
        bone.tail = blender(locations[children[0]]) if children else bone.head+Vector((0,-.04,-.04))
        if i in parents:
            bone.parent = arm.edit_bones[nodes[parents[i]]["name"]]
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in (original, body):
        mod = obj.modifiers.new("同一骨架", "ARMATURE")
        mod.object = rig
        obj.parent = rig
    for side in ("R", "L"):
        name = "Shin"+side
        b = rig.pose.bones[name]
        rest = b.bone.matrix_local
        def centre(joint):
            return blender(locations[skin["joints"][names.index(joint+side)]])
        femur = (centre("Shin")-centre("Thigh")).normalized()
        tibia = (centre("Foot")-centre("Shin")).normalized()
        hinge = femur.cross(tibia).normalized()
        rot = Matrix.Rotation(math.radians(95)-femur.angle(tibia),4,hinge)
        b.matrix = Matrix.Translation(rest.translation) @ rot @ Matrix.Translation(-rest.translation) @ rest
    for key in keys.values():
        key.value = 1
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "SINGLE"
    sh.single_color = (.56,.62,.64)
    sh.show_shadows = True
    sh.show_cavity = True
    sh.cavity_type = "WORLD"
    scene.world = bpy.data.worlds.new("检查底色")
    scene.world.color = (.14,.165,.18)
    sh.background_type = "WORLD"
    focus = blender(locations[skin["joints"][names.index("ShinR")]])
    lens = bpy.data.cameras.new("右膝 · 95°")
    eye = bpy.data.objects.new("检查机位",lens)
    scene.collection.objects.link(eye)
    eye.location = focus + Vector((-1.1,-.53,.18))
    eye.rotation_euler = (focus-eye.location).to_track_quat("-Z","Y").to_euler()
    lens.type = "ORTHO"
    lens.ortho_scale = .53
    lens.clip_start = .02
    scene.camera = eye
    scene.render.resolution_x = 680
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    before = original.evaluated_get(deps).data.vertices
    after = body.evaluated_get(deps).data.vertices
    fixed_pose = {}
    for side in ("R","L"):
        bones = rig.pose.bones
        femur = bones["Shin"+side].head-bones["Thigh"+side].head
        tibia = bones["Foot"+side].head-bones["Shin"+side].head
        angle = math.degrees(femur.angle(tibia))
        assert abs(angle-95)<.01, (side,angle)
        group = [i for i,_,_,_ in struct.iter_unpack("<HBbb",records) if (points[i][0]>0)==(side=="L")]
        displacement = sorted((after[i].co-before[i].co).length*1000 for i in group)
        fixed_pose[side] = {"flexDegrees":round(angle,4),"evaluatedVertices":len(group),
                            "p95DisplacementMm":round(displacement[round(.95*(len(group)-1))],3),
                            "maxDisplacementMm":round(max(displacement),3)}
    (EVIDENCE/"95度曲膝测量.json").write_text(json.dumps(fixed_pose,indent=2)+"\n",encoding="utf-8")
    for name, mesh_obj, other in [("基线", original, body),("冻结", body, original)]:
        mesh_obj.hide_render, other.hide_render = False, True
        bpy.context.view_layer.update()
        scene.render.filepath = str(EVIDENCE/("右膝95度-"+name+".png"))
        bpy.ops.render.render(write_still=True)
    original.hide_set(True)
    rig.hide_set(True)
    scene.render.filepath = "//右膝95度-冻结.png"
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(EVIDENCE/"骑手膝部校样.blend"),compress=True)
(EVIDENCE/"制作记录.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(report,ensure_ascii=True))
