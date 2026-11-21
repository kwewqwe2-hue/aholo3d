"""Blender background check of captured game triangles and their animated transforms.

blender -b --factory-startup --python-exit-code 1 --python scripts/verify-cargo-clearance.py -- CAPTURE_DIR
CAPTURE_DIR contains geometry.json and samples.json from the live Three.js scene.
Game-local metres, Y up. No axis conversion is needed for intersection tests.
"""
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def mesh_group(records):
    vertices, triangles, labels = [], [], []
    for mesh in records:
        pos = np.array(mesh["pos"], dtype=float).reshape(-1, 3)
        idx = np.array(mesh["idx"], dtype=np.int32).reshape(-1, 3)
        triangles.extend(idx + len(vertices))
        vertices.extend(pos)
        labels.extend([mesh["name"]] * len(idx))
    return np.asarray(vertices), np.asarray(triangles), labels


def apply(vertices, matrix):
    m = np.asarray(matrix, dtype=float).reshape(4, 4).T
    return vertices @ m[:3, :3].T + m[:3, 3]


def tree(points, indices):
    return BVHTree.FromPolygons(points.tolist(), indices.tolist(), all_triangles=True)


def contacts(wall, v_wall, i_wall, wall_names, lid, v_lid, i_lid, lid_names):
    result = []
    for a, b in wall.overlap(lid):
        v, moving = v_wall[i_wall[a]], v_lid[i_lid[b]]
        lo = np.maximum(v.min(axis=0), moving.min(axis=0))
        hi = np.minimum(v.max(axis=0), moving.max(axis=0))
        mid = .5 * (lo + hi)
        pin_joint = (wall_names[a].endswith(".metal") and lid_names[b].endswith(".metal")
                     and .116 < abs(mid[0]) < .179 and .277 < mid[1] < .307 and .204 < mid[2] < .225)
        if not pin_joint:
            result.append([*(round(1000*n, 1) for n in mid), wall_names[a], lid_names[b]])
    return result


def run(folder):
    geo = json.loads((folder / "geometry.json").read_text("utf8"))
    samples = json.loads((folder / "samples.json").read_text("utf8"))
    v_wall, i_wall, wall_names = mesh_group(geo["wall"])
    v_lid, i_lid, lid_names = mesh_group(geo["lid"])
    v_bag, i_bag, _ = mesh_group(geo["bag"])
    wall = tree(v_wall, i_wall)
    lid_cache, bag_cache = {}, {}
    rows, hinge_pairs = [], {}
    for sample in samples:
        bk, lk = tuple(sample["bag"]), tuple(sample["lid"])
        if bk not in bag_cache:
            p = apply(v_bag, bk)
            bag_cache[bk] = (p, tree(p, i_bag))
        if lk not in lid_cache:
            p = apply(v_lid, lk)
            lid_cache[lk] = (p, tree(p, i_lid))
        bag_v, bag = bag_cache[bk]
        lid_v, lid = lid_cache[lk]
        into_wall, into_lid = bag.overlap(wall), bag.overlap(lid)
        if lk not in hinge_pairs:
            hinge_pairs[lk] = contacts(wall,v_wall,i_wall,wall_names,lid,lid_v,i_lid,lid_names)
        type_, p = sample["motion"], sample["p"]
        e = p if type_ == "takeBag" else 1-p/.5 if type_ == "mount" and p <= .5 else -1
        target = apply(np.array([[sample["side"]*.201,.313,-.130]]), lk)[0]
        err = np.linalg.norm(np.array(sample["hand"])-target) if .20 <= e <= .76 else None
        rows.append(dict(motion=type_, progress=round(p,5), side=sample["side"], angle=round(np.rad2deg(sample["hinge"]),3),
                         bagParent=sample["bagParent"], bagVsWall=len(into_wall), bagVsLid=len(into_lid),
                         gripErrorMm=None if err is None else round(1000*err,3)))
    rest=next(r for r in samples if r["bagParent"]=="parcelInBox" and r["hinge"]==0)
    # Ray casts from actual paper vertices; measure occupied bag to foil, including the handles.
    resting, boxed = bag_cache[tuple(rest["bag"])]
    _, cover = lid_cache[tuple(rest["lid"])]
    def gap(candidates, target, sign):
        hits=[]
        for vertex in candidates:
            origin=Vector(vertex)
            hit=target.ray_cast(origin,Vector((0,sign,0)),.50)
            if hit[0] is not None:
                hits.append(float((hit[0]-origin).length))
        return None if not hits else round(1000*min(hits),3)
    top=resting[resting[:,1] >= resting[:,1].max()-.005]
    foot=resting[resting[:,1] <= resting[:,1].min()+.003]
    # Sweep the actual pivot between the sampled frames. Check a 180 mm section
    # of the fixed forward lip against *all* moving triangles, including hinge metal.
    front = np.unique(v_wall[(np.abs(v_wall[:,0])<.090) & (v_wall[:,2]>.201) &
                             (v_wall[:,1]>.255) & (v_wall[:,1]<.325)], axis=0)
    max_angle = max(s["hinge"] for s in samples)
    angles = np.unique(np.r_[np.deg2rad(np.arange(0,np.rad2deg(max_angle),.5)), max_angle])
    min_clear, failures, examples = float("inf"), 0, []
    pivot = np.array([0,.296,.215])
    for angle in angles:
        c,s = np.cos(angle),np.sin(angle)
        rotation = np.array([[1,0,0],[0,c,-s],[0,s,c]])
        v = (v_lid-pivot) @ rotation.T + pivot
        sweep = tree(v, i_lid)
        for pt in front:
            min_clear = min(min_clear,sweep.find_nearest(Vector(pt))[3])
        hit = contacts(wall,v_wall,i_wall,wall_names,sweep,v,i_lid,lid_names)
        if hit:
            failures += 1
            if len(examples)<6:
                examples.append([round(float(np.rad2deg(angle)),3),hit[0]])
    other_contacts = [hit for group in hinge_pairs.values() for hit in group]
    summary = {
        "Blender":bpy.app.version_string,"frames":len(rows),
        "states":{name:sum(r["motion"]==name for r in rows) for name in sorted({r["motion"] for r in rows})},
        "maxOpenDeg": max(r["angle"] for r in rows),
        "bagWallHitFrames": sum(r["bagVsWall"]>0 for r in rows), "bagLidHitFrames":sum(r["bagVsLid"]>0 for r in rows),
        "bagWallTrianglePairs": sum(r["bagVsWall"] for r in rows),"bagLidTrianglePairs":sum(r["bagVsLid"] for r in rows),
        "closedHandleToLidUpRayMm": None if boxed.overlap(cover) else gap(top,cover,1),
        "closedBagToFloorDownRayMm":None if boxed.overlap(wall) else gap(foot,wall,-1),
        "gripMaxMm":max((r["gripErrorMm"] for r in rows if r["gripErrorMm"] is not None), default=None),
        "gripSampleCount":sum(r["gripErrorMm"] is not None for r in rows),
        "unexpectedBodyLidPairsAcrossDistinctPoses": len(other_contacts), "contactExamplesMm":other_contacts[:6],
        "sweepAngles":len(angles), "sweepStepDeg":.5, "sweepHitAngles":failures, "sweepExamplesMm":examples,
        "frontLipVertexSamples":len(front), "frontLipNearestMm":round(1000*min_clear,3),
    }
    (folder/"clearance.json").write_text(json.dumps(dict(summary=summary,frames=rows),indent=2)+"\n","utf8")
    print("CARGO",json.dumps(summary,ensure_ascii=True))
    return summary


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--")+1:]
    result = run(Path(args[0]))
    if "--require-clear" in args and any(result[k] for k in [
        "bagWallHitFrames", "bagLidHitFrames", "unexpectedBodyLidPairsAcrossDistinctPoses", "sweepHitAngles"
    ]):
        raise RuntimeError("Cargo or cover collision; inspect clearance.json")
