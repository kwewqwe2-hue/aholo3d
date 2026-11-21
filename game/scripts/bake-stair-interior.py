"""Regenerate Building 7's local PBR tiles, enamel artwork and Cycles irradiance.

Run with ordinary Python (NumPy and Pillow), Node and Blender 4.3+:
    python scripts/bake-stair-interior.py --blender /path/to/blender
The Blender subprocess uses its own bundled Python. The authored resident.webp
portrait and the estate's existing plaster scan are source art. No downloads are required.
"""
import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "assets" / "stair"


def material_tiles():
    from PIL import Image, ImageDraw, ImageFont

    rng = np.random.default_rng(302)
    size = 768
    yy, xx = np.mgrid[:size, :size] / size

    def noise(cols, rows=None):
        rows = rows or cols
        grid = rng.normal(0, 1, (rows, cols))
        px, py = xx * cols, yy * rows
        x, y = px.astype(int), py.astype(int)
        u, v = px - x, py - y
        u, v = u*u*(3-2*u), v*v*(3-2*v)
        a = grid[y, x]*(1-u) + grid[y, (x+1) % cols]*u
        b = grid[(y+1) % rows, x]*(1-u) + grid[(y+1) % rows, (x+1) % cols]*u
        return a*(1-v) + b*v

    def image(values):
        return Image.fromarray(np.uint8(np.clip(values, 0, 255)))

    def dyed(rgb, tone):
        return np.array(rgb)[None, None, :] + tone[:, :, None]

    def save(name, pixels, quality=89):
        pic = pixels if isinstance(pixels, Image.Image) else image(pixels)
        pic.save(OUTPUT / (name + ".webp"), quality=quality, method=6)

    mottling = noise(4)*4 + noise(14)*2.9 + noise(63)*1.7
    grain = rng.normal(0, 1.8, (size, size))
    scratches = noise(167, 7)*.65 + noise(64, 4)*.70
    pits = np.maximum(0, noise(119)+noise(21)*.52-1.29)
    # Fractured paint islands expose the older buff plaster beneath.
    worn = noise(7)*.52 + noise(29)*.49 + noise(81)*.39 + noise(191)*.28 + grain*.055
    chip = np.clip((worn-1.23)*4.0, 0, 1)
    paint = dyed([96, 115, 94], mottling*.95 + scratches*.91 + grain*.9)
    paint *= 1 - np.clip((worn-1.06)*6, 0, 1)[:, :, None]*.13
    paint = paint*(1-chip[:, :, None]) + dyed([163, 152, 129], grain*2 + mottling)*chip[:, :, None]
    save("half-wall", paint)
    # R is micro-relief for bump mapping, G is perceptual roughness.
    height = 149 + grain*3.6 + scratches*2 - pits*36 - chip*51
    save("plaster-rh", np.stack([height, 219+grain*2-mottling*.6-chip*13, height], -1), 90)
    metal = dyed([231, 232, 223], scratches*2.1 + grain*1.3 + mottling*.35)
    metal -= (np.clip((worn-1.26)*3.2,0,1)*65)[:, :, None]
    save("iron-patina", metal, 83)

    # Aggregate is in the cement, including irregular white marble, amber glass,
    # fine basalt and a few large angular chips. The tile repeats every 1.22 m.
    ground = image(dyed([135, 130, 115], noise(9)*2.4+grain*3.4))
    physical = image(np.full((size,size,3), [115, 196, 115], dtype=np.uint8))
    albedo_draw, relief_draw = ImageDraw.Draw(ground), ImageDraw.Draw(physical)
    palette = [[197,185,160],[211,199,175],[167,159,141],[177,168,152],[153,142,120],
               [103,101,89],[83,82,73],[124,108,89],[208,208,189],[161,148,123],[114,117,104]]
    for i in range(56000):
        x,y = rng.uniform(0,size,2)
        r = min(5.7, .50+rng.exponential(.93))*(1.5 if i % 29 == 0 else 1)
        n = int(rng.integers(4,8))
        angles = (np.arange(n) + rng.uniform(-.3,.3,n))*2*math.pi/n
        radii = rng.uniform(.65,1.15,n)*r
        points = np.stack([np.cos(angles)*radii+x, np.sin(angles)*radii*rng.uniform(.50,1)+y],-1)
        rgb = np.clip(palette[i % len(palette)] + rng.normal(0,5,3),0,255).astype(int)
        v, rough = int(rng.integers(123,153)),int(rng.integers(96,177))
        for dx in ([0,size] if x<8 else [0,-size] if x>size-8 else [0]):
            for dy in ([0,size] if y<8 else [0,-size] if y>size-8 else [0]):
                poly=[(a+dx,b+dy) for a,b in points]
                albedo_draw.polygon(poly,fill=tuple(rgb))
                relief_draw.polygon(poly,fill=(v,rough,v))
    save("terrazzo",ground,94)
    save("terrazzo-rh",physical,92)
    grainwood = np.sin((yy*44 + noise(3,14)*.29 + np.sin(xx*math.tau)*.43)*math.tau)
    wood = dyed([139,93,59],grainwood*5.7+noise(8,141)*5+noise(6,35)*4.4+grain*.9)
    save("oak",wood)
    tile_grid = np.minimum(np.minimum(xx*6%1,1-xx*6%1),np.minimum(yy*5%1,1-yy*5%1))
    glaze = dyed([203,199,178],noise(36)*1.8+grain+noise(6,5)*3)
    grout = np.clip((.021-tile_grid)*74,0,1)[:, :, None]
    save("tile",glaze*(1-grout)+dyed([133,131,112],grain*1.5)*grout)

    # Domestic calico with small block-printed seed heads and worn warp threads.
    weave=np.sin(xx*260*math.tau)*1.5+np.sin(yy*283*math.tau)*1.6
    linen=image(dyed([157,110,100],weave+noise(11)*2+grain))
    cloth=ImageDraw.Draw(linen)
    for row in range(13):
        for col in range(12):
            x=int((col+.32+(row%2)*.45)*size/12); y=int((row+.45)*size/13)
            cloth.arc((x-9,y-8,x+2,y+10),20,123,fill="#b58d77",width=2)
            for dx,dy in [(0,0),(6,-3),(5,3)]:
                cloth.ellipse((x+dx-2,y+dy-2,x+dx+2,y+dy+2), fill="#c19a85")
    save("calico",linen,88)
    skin=dyed([207,160,132],noise(8)*2.1+noise(58)*1.6+grain*.6)
    skin[:,:,0]+=noise(6)*2.7
    skin[:,:,1]-=1.4*np.maximum(0,noise(86,59)-.92)
    save("hands",skin,87)
    vx=np.abs(xx-.5)*2
    midrib=np.exp(-((xx-.5)/.014)**2)
    fine_veins=(yy*9.0-vx*(.66-.20*yy)+noise(5)*.038)%1
    vein=np.exp(-(np.minimum(fine_veins,1-fine_veins)/.041)**2)*(1-vx*.62)
    leaf=dyed([102,135,67],mottling*.65+(1-vx)*8+midrib*37+vein*17+grain*.78)
    save("leaf",image(leaf).resize((256,384),Image.Resampling.LANCZOS),88)

    sheet = Image.new("RGB",(1024,512),(184,176,149))
    draw = ImageDraw.Draw(sheet)
    fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    def font(size, cjk=False):
        candidates = [fonts/("msyhbd.ttc" if cjk else "timesbd.ttf"),
                      Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc") if cjk
                      else Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf")]
        for path in candidates:
            if path.is_file():
                return ImageFont.truetype(str(path), size)
        raise RuntimeError("Install a CJK bold and a serif font or set the font paths in material_tiles().")
    def plate(rect, word, point, cjk=False):
        x,y,r,b=rect
        draw.rectangle(rect,fill="#e4dabe")
        draw.rounded_rectangle((x+5,y+4,r-5,b-4),radius=8,outline="#434d55",width=5)
        draw.rounded_rectangle((x+11,y+10,r-11,b-10),radius=5,outline="#7c7e76",width=2)
        draw.text(((x+r)/2,(y+b)/2-1),word,anchor="mm",fill="#2c404e",font=font(point,cjk))
    plate((0,0,470,188),"7号楼",113,True)
    plate((478,0,778,136),"302",106)
    plate((782,0,1020,136),"202",98)
    plate((819,165,1020,273),"102",78)
    plate((310,200,514,292),"信 报",49,True)
    draw.rectangle((0,199,297,383), fill="#c4bc9f")
    draw.text((149,207),"单相电能表",anchor="mt",font=font(26,True),fill="#373b34")
    draw.text((147,250),"01946 7",anchor="mt",font=font(48),fill="#292e28",stroke_width=1)
    draw.line((22,307,278,307), fill="#5b5c49", width=4)
    draw.text((152,325),"220 V    50 Hz    kWh",anchor="mt",font=font(23),fill="#4c4e40")
    draw.rectangle((530,166,804,498),fill="#c7ac87")
    draw.rectangle((548,180,785,482),fill="#d9d2b9",outline="#7f7964",width=3)
    draw.text((664,214),"单元公约",anchor="mm",font=font(46,True),fill="#7d4534")
    for i,s in enumerate(["随手关灯","爱护公物","楼道保持畅通","邻里互相照应"]):
        draw.text((666,278+i*49),s,anchor="mm",font=font(23,True),fill="#55594c")
    plate((817,303,1019,492),"电 闸",39,True)
    # Slight enamel pitting around the type without compromising the digits.
    fine = rng.normal(0,1.9,(512,1024,1))
    save("enamel",np.array(sheet).astype(float)+fine,95)


def bake_in_blender(stage, samples):
    import bpy
    from mathutils import Vector
    data=json.loads((stage/"geometry.json").read_text(encoding="utf8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.samples=samples
    scene.cycles.max_bounces=5
    scene.cycles.diffuse_bounces=4
    scene.cycles.seed=702
    prefs=bpy.context.preferences.addons["cycles"].preferences
    for kind in ["OPTIX","CUDA","METAL","HIP"]:
        try:
            prefs.compute_device_type=kind
            prefs.refresh_devices()
            if any(d.type==kind for d in prefs.devices):
                for device in prefs.devices:
                    device.use=device.type==kind
                scene.cycles.device="GPU"
                break
        except (TypeError, RuntimeError):
            continue
    size=data["atlasSize"]
    target=bpy.data.images.new("Linear irradiance",width=size,height=size,float_buffer=True,alpha=False)
    target.colorspace_settings.name="Non-Color"
    # Approximate diffuse reflectance of the same tiles for the colour of the rebound.
    tiles={"lime":(.64,.58,.47),"paint":(.12,.17,.11),"stone":(.25,.23,.18),
           "riser":(.25,.23,.18),"nosing":(.25,.23,.18),"tile":(.60,.57,.46),
           "wood":(.26,.13,.06),"metal":(.75,.75,.70),"base":(.64,.58,.47)}
    mats={}
    for key in {b["finish"] for b in data["batches"]}:
        mat=bpy.data.materials.new(key)
        mat.use_nodes=True
        nodes=mat.node_tree.nodes
        rgb=nodes.new("ShaderNodeVertexColor")
        rgb.layer_name="Tint"
        mul=nodes.new("ShaderNodeMixRGB")
        mul.blend_type="MULTIPLY"
        mul.inputs[0].default_value=1
        mul.inputs[2].default_value=(*tiles.get(key,(1,1,1)),1)
        mat.node_tree.links.new(rgb.outputs["Color"],mul.inputs[1])
        mat.node_tree.links.new(mul.outputs[0],nodes.get("Principled BSDF").inputs["Base Color"])
        texture=nodes.new("ShaderNodeTexImage")
        texture.image=target
        nodes.active=texture
        mats[key]=mat
    def object_mesh(name, batches, bake=False):
        verts=[]; colors=[]; indices=[]; texcoords=[]; mat_indices=[]
        slots=list(dict.fromkeys(b["finish"] for b in batches))
        for b in batches:
            v=np.array(b["positions"],np.float32).reshape(-1,3)
            faces=np.array(b["indices"],np.int32).reshape(-1,3)
            indices.extend((faces+len(verts)).tolist()); verts.extend(v.tolist())
            colors.extend(np.array(b["colors"],np.float32).reshape(-1,3).tolist())
            if bake:
                texcoords.extend(np.array(b["uv1"],np.float32).reshape(-1,2)[faces].reshape(-1).tolist())
            mat_indices.extend([slots.index(b["finish"])]*len(faces))
        me=bpy.data.meshes.new(name)
        me.from_pydata(verts,[],indices)
        for slot in slots: me.materials.append(mats[slot])
        me.polygons.foreach_set("material_index",mat_indices)
        color=me.color_attributes.new(name="Tint",type="FLOAT_COLOR",domain="POINT")
        color.data.foreach_set("color",np.column_stack([colors,np.ones(len(verts))]).astype("f").ravel())
        if bake: me.uv_layers.new(name="Light UV").data.foreach_set("uv",texcoords)
        me.update()
        obj=bpy.data.objects.new(name,me)
        scene.collection.objects.link(obj)
        return obj
    surfaces=object_mesh("Receiving stone and plaster",[b for b in data["batches"] if b["bake"]],True)
    object_mesh("Rails, mullions and fittings",[b for b in data["batches"] if b["part"]=="fixed"
                and not b["bake"] and b["finish"]!="glass"])
    door=object_mesh("Door at rest",[b for b in data["batches"] if b["part"]=="door"])
    door.location=data["hinge"]; door.rotation_euler.z=math.radians(4)
    g=data["layout"]; w=g["halfWidth"];d=g["depth"];h=g["floorHeight"]
    def block(name,lo,hi):
        bpy.ops.mesh.primitive_cube_add(size=1,location=[(a+b)/2 for a,b in zip(lo,hi)])
        obj=bpy.context.object;obj.name=name;obj.dimensions=[b-a for a,b in zip(lo,hi)]
        mat=bpy.data.materials.get("Old brick") or bpy.data.materials.new("Old brick")
        mat.diffuse_color=(.45,.38,.30,1);obj.data.materials.append(mat)
    block("West apartments",[-33,-.02,-.35],[-w-.26,26,13.4])
    block("East apartments",[w+3.2,-.02,-.35],[33,26,13.4])
    block("Far side of light court",[-w-.26,d+4.2,-.35],[w+3.2,26,13.4])
    block("Courtyard ground",[-45,-27,-.32],[45,28,-.04])
    block("Upper front storey",[-w-.26,-.1,3*h+.18],[w+3.2,2.75,13.4])
    world=bpy.data.worlds.new("Warm afternoon skylight");scene.world=world;world.use_nodes=True
    bg=world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value=(.73,.85,1,1);bg.inputs["Strength"].default_value=.63
    def light(name,kind,loc,target_point,energy,color,size):
        lamp=bpy.data.lights.new(name,kind);obj=bpy.data.objects.new(name,lamp)
        scene.collection.objects.link(obj);obj.location=loc
        obj.rotation_euler=(Vector(target_point)-Vector(loc)).to_track_quat("-Z","Y").to_euler()
        lamp.energy=energy;lamp.color=color
        if kind=="SUN": lamp.angle=size
        else: lamp.shape="DISK";lamp.size=size
    light("Southwest sun","SUN",[-7,-12,9],[0,0,0],3.3,(1,.79,.58),.032)
    for i,x in enumerate([-.54,-.54,2.58]):
        light("Landing bowl","AREA",[x,1.3,(i+1)*h-.42],[x,1.3,i*h],48,(1,.72,.42),.38)
    light("Entry bowl","AREA",[.04,-.46,2.71],[.04,.66,.60],36,(1,.75,.51),.36)
    light("Apartment lamp","AREA",[w+1.46,1.1,3*h-.36],[w+.03,1.23,2*h+.8],62,(1,.67,.37),.63)
    # The enclosed court receives a broad sky reflection from the sunlit opposite facade.
    for z in [3.65,6.85]:
        light("Court bounce","AREA",[w+2.46,6.41,z+.62],[0,5.5,z-1.30],127,(.92,.89,.76),2.8)
        light("North sky","AREA",[.0,d+2.1,z+.71],[0,g["back"],z-.50],112,(.76,.88,1),3.1)
    bpy.ops.object.select_all(action="DESELECT");surfaces.select_set(True)
    bpy.context.view_layer.objects.active=surfaces
    scene.render.bake.margin=3
    scene.render.bake.margin_type="EXTEND"
    bpy.ops.object.bake(type="DIFFUSE",pass_filter={"DIRECT","INDIRECT"},margin=3,use_clear=True)
    buffer=np.empty(size*size*4,dtype=np.float32);target.pixels.foreach_get(buffer)
    np.save(stage/"light.npy",buffer.reshape(size,size,4)[::-1,:,:3])


def main():
    from PIL import Image
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blender", default=os.environ.get("BLENDER_BIN") or shutil.which("blender") or "blender")
    parser.add_argument("--samples",type=int,default=384)
    flags=parser.add_mutually_exclusive_group()
    flags.add_argument("--tiles-only",action="store_true"); flags.add_argument("--light-only",action="store_true")
    args=parser.parse_args()
    OUTPUT.mkdir(exist_ok=True,parents=True)
    if not args.light_only: material_tiles()
    if args.tiles_only: return
    with tempfile.TemporaryDirectory(prefix="building7-") as temp:
        stage=Path(temp)
        code="""import {campaignDistrict} from './src/campaign-course.js';
import {createStairLayout} from './src/stair-layout.js';
import {buildStairSurfaces} from './src/stair-interior.js';
const layout=createStairLayout(campaignDistrict);
console.log(JSON.stringify({...buildStairSurfaces(layout),layout}));"""
        with (stage/"geometry.json").open("wb") as output:
            subprocess.run(["node","--input-type=module","-e",code],cwd=ROOT,stdout=output,check=True)
        subprocess.run([args.blender,"--background","--factory-startup","--offline-mode","--disable-autoexec",
                        "--python-exit-code","1","--python",str(Path(__file__).resolve()),"--",str(stage),str(args.samples)],check=True)
        raw=np.load(stage/"light.npy")
        if not np.isfinite(raw).all() or np.max(raw)<.1:
            raise ValueError("Cycles returned an empty or non-finite lightmap")
        # Store linear values 0..4 in an sRGB container. The material restores
        # the scale at sample time. Black outside the padded islands is unused.
        # Range-aware filter in linear light. The atlas gutters are wider than
        # the 2-texel radius, preserving unrelated islands and window bars.
        lum=raw @ np.array([.2126,.7152,.0722],np.float32)
        total=np.zeros_like(raw); weights=np.zeros_like(lum)
        for iy in range(-2,3):
            for ix in range(-2,3):
                delta=np.roll(lum,(iy,ix),axis=(0,1))-lum
                k=np.exp(-.20*(ix*ix+iy*iy)-.5*(delta/(.025+.12*lum))**2)
                total+=np.roll(raw,(iy,ix),axis=(0,1))*k[:,:,None];weights+=k
        scaled=np.clip(total/weights[:,:,None]*.25,0,1)
        encoded=np.where(scaled<=.0031308,scaled*12.92,1.055*scaled**(1/2.4)-.055)
        Image.fromarray(np.uint8(encoded*255+.5)).save(OUTPUT/"irradiance.webp",quality=94,method=6)
        geometry=json.loads((stage/"geometry.json").read_text())
        print("Cycles diffuse direct + indirect:",args.samples,"samples, 4 diffuse bounces;",
              geometry["atlasSize"],"px,",geometry["density"],"texels/m.",
              "Lit texels:",int((raw.max(axis=2)>.002).sum()),"peak:",round(float(raw.max()),3))


if __name__=="__main__":
    if "--" in sys.argv:
        folder,count=sys.argv[sys.argv.index("--")+1:]
        bake_in_blender(Path(folder),int(count))
    else:
        main()
