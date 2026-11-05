#!/usr/bin/env python3
"""Task 103: generate all app icons + brand assets from the official 3Boxes logo."""
import json
import os
from PIL import Image

SRC = "/home/z/my-project/upload/pasted_image_1792218896772.png"
APP = "/home/z/my-project/hrms_app"

src = Image.open(SRC).convert("RGB")
assert src.size == (1024, 1024), src.size

# ---------- 1. Full logo -> assets/logos/logo-3boxes.png ----------
full = src.copy()
full.save(f"{APP}/assets/logos/logo-3boxes.png", optimize=True)
print("saved assets/logos/logo-3boxes.png")

# ---------- 2. Cubes-only crop (for MaanLogoMark) ----------
# Non-white bbox of the top region (cubes live above the wordmark)
top = src.crop((0, 0, 1024, 590))
mask = top.convert("L").point(lambda p: 255 if p < 245 else 0)
bbox = mask.getbbox()
print("cubes bbox:", bbox)
pad = 8
l, t, r, b = bbox
l, t = max(0, l - pad), max(0, t - pad)
r, b = min(1024, r + pad), min(1024, b + pad)
# make square around cubes
w, h = r - l, b - t
side = max(w, h)
cx, cy = (l + r) // 2, (t + b) // 2
half = side // 2
l2, t2, r2, b2 = cx - half, cy - half, cx + half, cy + half
if b2 > 590:  # never dip into the wordmark
    b2 = 590
    t2 = b2 - side
cubes = src.crop((l2, t2, r2, b2)).resize((768, 768), Image.LANCZOS)
cubes.save(f"{APP}/assets/logos/logo-cubes.png", optimize=True)
print("saved assets/logos/logo-cubes.png", cubes.size)

# ---------- 3. Android launcher mipmaps ----------
densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for dpi, px in densities.items():
    d = f"{APP}/android/app/src/main/res/mipmap-{dpi}"
    os.makedirs(d, exist_ok=True)
    full.resize((px, px), Image.LANCZOS).save(f"{d}/ic_launcher.png", optimize=True)
print("android mipmaps:", densities)

# ---------- 4. iOS AppIcon set ----------
cjson = f"{APP}/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json"
with open(cjson) as f:
    entries = json.load(f)["images"]
for e in entries:
    fn = e.get("filename")
    if not fn:
        continue
    px = int(float(e["size"].split("x")[0]) * float(e.get("scale", "1x").rstrip("x")))
    full.resize((px, px), Image.LANCZOS).save(f"{os.path.dirname(cjson)}/{fn}", optimize=True)
print(f"ios appiconset: {len(entries)} icons")

# ---------- 5. Branded native launch image (larger, for launch screen) ----------
full.resize((360, 360), Image.LANCZOS).save(
    f"{APP}/android/app/src/main/res/mipmap-xxxhdpi/launch_image.png", optimize=True)
print("saved launch_image.png (xxxhdpi, referenced by launch_background)")

print("ALL ICONS DONE")
