"""
Fetches the scanned materials the venues are drawn with and makes the game's textures from them.

    python tools/stage/textures/build_textures.py [--src local-audio/textures] [--out public/stage/textures] [--only name ...]

The scans are from ambientCG (https://ambientcg.com), licensed CC0 1.0 (public domain): free for
any use, commercial included, with no attribution required (they are credited in
docs/THIRD_PARTY.md all the same). Their 4K packages are downloaded once into --src, which is not
part of the repository.

For every material the game gets two tiling textures in three sizes (4k, 2k, 1k; the graphics
settings pick one):

    <name>_c.webp   colour
    <name>_n.webp   the normal's x and y in red and green (OpenGL convention: green points up),
                    and the roughness in blue

Needs Pillow (pip install pillow).
"""
import argparse
import io
import os
import sys
import urllib.request
import zipfile

from PIL import Image, ImageChops

Image.MAX_IMAGE_PIXELS = None

# The game's name for each material, and the ambientCG asset it is made from.
MATERIALS = {
    'concrete_wall': 'Concrete046',
    'concrete_floor': 'Concrete048',
    'brick': 'Bricks097',
    'sandstone': 'Bricks084',
    'marble': 'Marble012',
    'plaster': 'Plaster001',
    'wood_floor': 'WoodFloor051',
    'planks': 'Planks023A',
    'steel_rust': 'Metal064',
    'steel_paint': 'PaintedMetal004',
    'steel_ribbed': 'CorrugatedSteel005',
    'steel_tread': 'DiamondPlate008C',
    'carpet': 'Carpet016',
    'grass': 'Grass004',
    'ground': 'Ground037',
    'asphalt': 'Asphalt031',
}
SIZES = {'4k': 4096, '2k': 2048, '1k': 1024}

ap = argparse.ArgumentParser()
ap.add_argument('--src', default='local-audio/textures')
ap.add_argument('--out', default='public/stage/textures')
ap.add_argument('--only', nargs='*')
args = ap.parse_args()
os.makedirs(args.src, exist_ok=True)


def fetch(asset):
    path = os.path.join(args.src, f'{asset}_4K-JPG.zip')
    if not os.path.exists(path):
        url = f'https://ambientcg.com/get?file={asset}_4K-JPG.zip'
        print('downloading', url, flush=True)
        req = urllib.request.Request(url, headers={'User-Agent': 'texture-build'})
        with urllib.request.urlopen(req, timeout=120) as r, open(path + '.part', 'wb') as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        os.replace(path + '.part', path)
    return path


def read(z, suffix, mode):
    name = next((n for n in z.namelist() if n.endswith(suffix)), None)
    if name is None:
        return None
    return Image.open(io.BytesIO(z.read(name))).convert(mode)


for name, asset in MATERIALS.items():
    if args.only and name not in args.only:
        continue
    with zipfile.ZipFile(fetch(asset)) as z:
        color = read(z, '_Color.jpg', 'RGB')
        rough = read(z, '_Roughness.jpg', 'L')
        normal = read(z, '_NormalGL.jpg', 'RGB')
        ao = read(z, '_AmbientOcclusion.jpg', 'L')
    if color is None or normal is None:
        sys.exit(f'{asset}: no colour or normal map in the package')
    if rough is None:
        rough = Image.new('L', color.size, 200)
    if ao is not None:
        # The scan's own contact shading goes into the colour, at half strength.
        shade = ao.resize(color.size).point(lambda v: 128 + v // 2)
        color = Image.merge('RGB', [ImageChops.multiply(c, shade) for c in color.split()])
    for label, size in SIZES.items():
        out = os.path.join(args.out, label)
        os.makedirs(out, exist_ok=True)
        color.resize((size, size), Image.LANCZOS).save(os.path.join(out, f'{name}_c.webp'), 'WEBP', quality=78, method=6)
        n = normal.resize((size, size), Image.LANCZOS)
        nx, ny, _ = n.split()
        packed = Image.merge('RGB', (nx, ny, rough.resize((size, size), Image.LANCZOS)))
        packed.save(os.path.join(out, f'{name}_n.webp'), 'WEBP', quality=84, method=6)
    print('made', name, 'from', asset, flush=True)
