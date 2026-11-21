"""Rebuild the two UV charts for the scooter carrier. Run with Python, NumPy and Pillow."""
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "courier-cargo"
W, H, PAD = 504, 376, 4
Y, X = np.mgrid[:H, :W].astype(np.float32)
U, V = X / (W - 1), Y / (H - 1)
rng = np.random.default_rng(72119)


def noise(nx, ny):
    field = rng.normal(128, 38, (ny, nx)).clip(0, 255).astype("uint8")
    return (np.asarray(Image.fromarray(field).resize((W, H), Image.Resampling.BICUBIC)).astype("f") - 128) / 38


def gaussian(x, width):
    return np.exp(-np.square(x / width))


def row_of_thread(color, height, centre, along, pitch, width):
    """Two visible thread ends and the pocket of shadow where the needle passed."""
    dist = centre * H
    stitch = gaussian(dist, width) * np.exp(-((np.mod(along, pitch) - pitch / 2) / (.33 * pitch)) ** 4)
    hole = gaussian(dist - .65, 1.8) * gaussian(np.mod(along, pitch) - pitch / 2 + pitch * .39, 1.5)
    color += (stitch * 30 - hole * 36 - gaussian(dist - 2.5, 1.25) * 9)[..., None]
    height += stitch * 58 - hole * 42


def textile(slot):
    macro, uneven = noise(8, 6), noise(38, 32)
    fuzz = rng.normal(0, 1, (H, W))
    # Basket weave reverses its highlight at each over/under crossing.
    xx = X + .55 * np.sin(Y / 49) + .32 * macro
    yy = Y + .65 * np.sin(X / 69) - .24 * macro
    pick = np.cos(np.pi * xx / 2.7) * np.cos(np.pi * yy / 2.4)
    weave = 2.0 * np.cos(xx * 2.36) + 1.7 * np.cos(yy * 2.59) + 3.3 * pick
    edge = np.minimum.reduce([U, 1 - U, V * .84, (1 - V) * .84])
    # Puckering tapers off toward the middle of the panel. Keep the ox print legible.
    relief = np.zeros_like(U)
    for x, y, slope, strength, reach in [
        (.027,.11,.41,1,.25),(.062,.14,.85,.63,.21),(.98,.23,-.43,.80,.32),
        (.03,.88,-.48,1.0,.38),(.96,.86,.69,1.15,.38),(.94,.95,.25,.74,.21),
        (.28,.96,-.84,.53,.16),(.69,.06,.62,.56,.17)]:
        if slot == 2:
            y, strength, reach = .52 + (y - .52) * .63, strength * .73, reach * 1.18
        elif slot == 1:
            x, y = 1 - x, y * .94
            slope = -slope
        dx, dy = U - x, V - y
        d = dy - slope * dx - .27 * dx * dx
        relief += strength * np.exp(-(dx*dx + dy*dy) / reach**2 * 2.5) * (
            gaussian(d - .010, .019) - .95 * gaussian(d + .007, .011))
    binding_dirt = np.exp(-edge/.036) * (10 + 3.5 * uneven)
    road = V**3 * (20 + 8 * macro + 4 * uneven) if slot != 2 else 4 * macro
    sun = (1 - V) * .73 + .27 * (1 - U)
    base = np.array([[211,159,65], [203,149,61], [216,167,78]][slot], dtype="f")
    tone = (macro * 5.5 + uneven * 3.1 + fuzz * 2.6 + weave + relief * 24
            - binding_dirt - road + sun * 4)
    color = base + tone[...,None] * np.array([1,.91,.64])
    if slot != 2:
        # The bottom corners pick up splash and lose dye on the high fibres.
        # The contact marks grow in clusters rather than covering the whole panel.
        heel = gaussian(V-.91,.16) * (gaussian(U-.09,.14) + gaussian(U-.91,.18))
        spatter = np.clip((noise(75,60)+.50*uneven-.44)*1.6,0,1) * heel
        color -= spatter[...,None]*np.array([37,36,22])
        salt = np.clip(noise(102,83)+.45*uneven-.47,0,1)*heel
        color += salt[...,None] * np.array([40,40,30])
        for cx, cy in [(.035,.12),(.95,.19),(.14,.90),(.91,.82)]:
            for _ in range(27):
                x=int(rng.normal(cx*W,15)); y=int(rng.normal(cy*H,14))
                if not (0<=x<W-12 and 0<=y<H-2): continue
                length=int(rng.integers(2,9))
                color[y,x:x+length] += [24,23,19]
                color[y+1,x+1:x+length] -= [9,8,6]
    # Frayed warp at the bottom corners reveals lighter fibre between patches of road grime.
    rub = np.clip((uneven + macro * .36 - .08) * .81, 0, 1) * np.exp(-edge/.049)
    color += rub[...,None] * np.array([24,24,18])
    height = 131 + pick * 12 + weave * 2 + fuzz * 3 + relief * 24 - binding_dirt * .55
    for val in [.032, .046, .954, .968]:
        row_of_thread(color,height,(U-val)*W/H,Y+val*61,9,1.05)
    for val in ([.049,.064,.926,.944] if slot==2 else [.064,.883,.903]):
        row_of_thread(color,height,V-val, X+val*90,10,1.12)
    if slot == 0:
        # Sew the two repair gussets directly into this UV chart. They remain
        # registered to the deformed panel even at the longest chase distance.
        for along,span,rise in [(U,.15,.16),(1-U,.18,.19)]:
            cut = 1-(rise*np.maximum(0,1-along/span)**1.5+.046)
            inset = np.minimum(V-cut, span-along)
            mask = np.clip(inset*W,0,1)
            color -= mask[...,None] * np.array([62,54,24])
            color += (mask*(8*uneven+4*pick))[...,None]
            height += mask*24
            lane = np.where(along<span-.006,V-cut-.012,.5)
            row_of_thread(color,height,lane,X*1.2+Y*.16,8,1.0)
    rough = 197 + 13*macro + uneven*5 + rub*12 + 7*pick
    return color, np.stack([height,rough,np.zeros_like(U)],axis=-1)


def foil():
    macro, mid = noise(11, 8), noise(85, 62)
    jitter = .012*macro + .004*mid
    a = (U*6.4 + V*4.2 + jitter) * np.pi
    b = (U*6.4 - V*4.2 - .4*jitter) * np.pi
    diamond = np.abs(np.sin(a)*np.sin(b))**.49
    seal = np.exp(-np.minimum(np.sin(a)**2,np.sin(b)**2)/.015)
    facet = np.sin(a*2)*np.cos(b*2) * 4.5
    crinkle = np.sin(X*.21 + Y*.27 + 1.6*mid + macro) * 2.7 + mid*4
    tonal = diamond*18 - seal*35 + macro*2.5 + facet*1.15 + crinkle*.9
    color = np.array([191,193,186]) + tonal[...,None]
    height = 76 + 105*diamond - 28*seal + 7*mid + 2*crinkle
    rough = 143 + 24*seal + 8*macro + 6*mid
    return color, np.stack([height,rough,118-35*seal+mid*6],axis=-1)


def side_and_trims():
    side = textile(1)
    charts = []
    h, w = 88, W // 2
    yy, xx = np.mgrid[:h,:w]
    t = yy / (h - 1)
    rib = np.cos(xx*1.2 + np.abs(np.mod(yy,16)-8)*.84)
    stitch = sum(gaussian(t-v,.018) for v in [.11,.89]) * (np.mod(xx,14)<9)
    yarn = 33 + rib*5 + noise(24,28)[:h,:w]*3 + stitch*60
    tape_prism = np.cos((xx + yy*.6)*.75) * np.cos((xx - yy*.6)*.75)
    blocks = (xx//17) % 2
    foil_tone = 141 + 12*blocks + 8*tape_prism + 12*np.sin(np.pi*t) + 14*stitch
    margin = np.minimum(t,1-t)<.077
    foil_tone = np.where(margin,74+rib*4,foil_tone)
    for key in range(2):
        panel = np.asarray(Image.fromarray(side[key].clip(0,255).astype("uint8")).resize((W,H-h-8)))
        if key == 0:
            web = np.stack([yarn+11,yarn+7,yarn+3],axis=-1)
            tape = np.stack([foil_tone+12,foil_tone+10,foil_tone+1],axis=-1)
        else:
            web = np.stack([123+rib*28+stitch*46,197+rib*15,0*rib],axis=-1)
            tape = np.stack([130+tape_prism*18+stitch*26,145+15*tape_prism,90+blocks*29],axis=-1)
        trim = np.concatenate([web,tape],axis=1)
        charts.append(np.concatenate([panel,np.repeat(panel[-1:],4,axis=0),np.repeat(trim[:1],4,axis=0),trim],axis=0))
    return charts


def padded(image):
    return np.pad(image.clip(0,255).astype("uint8"), ((PAD,PAD),(PAD,PAD),(0,0)), mode="edge")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    charts = [textile(0), side_and_trims(), textile(2), foil()]
    for i, name in enumerate(["panels.webp", "panel-surface.webp"]):
        rows = [np.concatenate([padded(charts[cell][i]) for cell in cells], axis=1) for cells in [(0,1),(2,3)]]
        im = Image.fromarray(np.concatenate(rows, axis=0))
        im.save(OUT/name, "WEBP", quality=83 if i==0 else 80, method=6)
        print(name, im.size, (OUT/name).stat().st_size)


if __name__ == "__main__":
    main()
