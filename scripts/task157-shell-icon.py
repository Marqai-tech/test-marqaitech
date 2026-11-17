#!/usr/bin/env python3
"""Task 157 — generate the WebView-shell app launcher icon.

The native app icon (hrms_app) is the 3 Boxes HRMS cubes logo in GREEN.
The shell app (mobile-app) still ships the default Flutter icon. This script
recolours the native icon's greens to ROYAL BLUE (SmartHR royal #3A57C4
family) so the shell app is instantly distinguishable from the native app
while keeping the exact 3 Boxes HRMS brand composition.
"""
from PIL import Image
import numpy as np
import os

SRC = '/home/z/my-project/hrms_app/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'
RES = '/home/z/my-project/mobile-app/android/app/src/main/res'
# xxxhdpi is 192px; standard launcher densities
DENSITIES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}

im = Image.open(SRC).convert('RGBA')
arr = np.array(im).astype(np.float32)

hsv = np.array(Image.fromarray(arr.astype(np.uint8)).convert('HSV')).astype(np.float32)
H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]

# Green hues in PIL's 0-255 hue circle: green ≈ 60-120 (≈85-170 degrees).
green_mask = (H >= 40) & (H <= 140) & (S > 40)

# Shift green -> royal blue. Target hue ≈ #3A57C4 (227 deg) -> PIL H ≈ 161.
# Spread the blues a little so the 3-cube shading survives: two-tone like the
# original (darker left/center cube, brighter right cube) by offsetting hue
# slightly per original brightness.
h_shift = np.full_like(H, 161.0)
h_new = np.where(green_mask, h_shift, H)

# Slight hue spread for depth: brighter pixels lean a touch brighter-blue
bright = (V > 150) & green_mask
h_new = np.where(bright, 168.0, h_new)  # brighter cubes -> a bit more blue-green

hsv2 = hsv.copy()
hsv2[..., 0] = h_new
# Nudge saturation up slightly for launcher-visibility at small sizes
hsv2[..., 1] = np.where(green_mask, np.clip(S * 1.08, 0, 255), S)

out = Image.fromarray(hsv2.astype(np.uint8), 'HSV').convert('RGBA')
out.putalpha(Image.fromarray(arr[..., 3].astype(np.uint8)))

for dpi, size in DENSITIES.items():
    img = out.resize((size, size), Image.LANCZOS)
    path = os.path.join(RES, f'mipmap-{dpi}', 'ic_launcher.png')
    img.save(path, 'PNG')
    print(f'wrote {path} ({size}x{size})')

# Also regenerate the splash/launch image if the shell ships one
for extra in ['launch_image.png']:
    p = os.path.join(RES, 'mipmap-xxxhdpi', extra)
    if os.path.exists(p):
        Image.open(p).convert('RGBA')
        print('note: launch image exists:', p)

print('done — shell icon is now the 3 Boxes HRMS logo in royal blue')
