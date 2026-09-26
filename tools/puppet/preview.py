"""原画分层绑定 · 描边预览（给绑定作者用）

在原画上叠加：坐标网格、各图层多边形（彩色描边 + 名称）、补画区域（虚线）、骨骼枢轴、摆动方向。
可以裁剪局部并放大，方便精确描点。

用法：
    python tools/puppet/preview.py alter-e0 --out D:\\tmp\\p.png
    python tools/puppet/preview.py alter-e0 --crop 800 150 1250 600 --scale 2 --grid 20 --out D:\\tmp\\head.png
    python tools/puppet/preview.py alter-e0 --only hair_front,face --out ...
    python tools/puppet/preview.py alter-e0 --raw --crop ... --out ...    # 只看原画 + 网格（描点前用）
"""
import argparse
import colorsys
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build import load_source, as_polys  # noqa: E402


def fill_polys(v):
    """fill 里既可以是多边形，也可以是 {poly, inpaint / smear / sample ...} 字典：只取多边形来画"""
    if not v:
        return []
    if not isinstance(v[0], dict) and isinstance(v[0][0], (int, float)):
        return [v]
    out = []
    for f in v:
        if isinstance(f, dict):
            out += as_polys(f.get('poly'))
        else:
            out.append(f)
    return out


def font(size):
    for f in ('C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/arial.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('key')
    ap.add_argument('--out', required=True)
    ap.add_argument('--crop', nargs=4, type=float, metavar=('X0', 'Y0', 'X1', 'Y1'))
    ap.add_argument('--scale', type=float, default=None, help='输出缩放（默认：整图缩到 1400 宽）')
    ap.add_argument('--grid', type=int, default=None, help='网格间距（原画像素）')
    ap.add_argument('--only', default=None, help='只画这些图层（逗号分隔）')
    ap.add_argument('--raw', action='store_true', help='不画图层，只画原画 + 网格')
    ap.add_argument('--dim', type=float, default=0.0, help='原画变暗程度 0..1，便于看清描边')
    a = ap.parse_args()

    with open(os.path.join(HERE, 'rigs', a.key + '.json'), encoding='utf-8') as f:
        rig = json.load(f)
    rig['key'] = a.key
    import numpy as np
    src = load_source(rig)
    H, W = src.shape[:2]
    im = Image.fromarray((src * 255).astype('uint8'), 'RGBA')
    bg = Image.new('RGBA', im.size, (205, 210, 222, 255))
    # 棋盘底，便于分辨透明区域
    d0 = ImageDraw.Draw(bg)
    for y in range(0, H, 32):
        for x in range(0, W, 32):
            if (x // 32 + y // 32) % 2:
                d0.rectangle([x, y, x + 31, y + 31], fill=(190, 196, 210, 255))
    bg.alpha_composite(im)
    if a.dim > 0:
        bg = Image.blend(bg, Image.new('RGBA', bg.size, (20, 20, 30, 255)), a.dim)

    x0, y0, x1, y1 = a.crop if a.crop else (0, 0, W, H)
    x0, y0, x1, y1 = int(max(0, x0)), int(max(0, y0)), int(min(W, x1)), int(min(H, y1))
    scale = a.scale or min(1.0, 1400 / (x1 - x0))
    view = bg.crop((x0, y0, x1, y1)).resize((int((x1 - x0) * scale), int((y1 - y0) * scale)), Image.LANCZOS)
    dr = ImageDraw.Draw(view, 'RGBA')
    T = lambda p: ((p[0] - x0) * scale, (p[1] - y0) * scale)
    fnt = font(max(11, int(13 * min(2, scale * 1.3))))

    # 网格
    g = a.grid or (10 if x1 - x0 < 300 else 25 if x1 - x0 < 700 else 50 if x1 - x0 < 1400 else 100)
    for gx in range((x0 // g) * g, x1 + 1, g):
        major = gx % (g * 5) == 0
        X = (gx - x0) * scale
        dr.line([(X, 0), (X, view.height)], fill=(0, 90, 255, 110 if major else 45), width=1)
        if major:
            dr.text((X + 2, 2), str(gx), fill=(0, 60, 200, 255), font=fnt)
    for gy in range((y0 // g) * g, y1 + 1, g):
        major = gy % (g * 5) == 0
        Y = (gy - y0) * scale
        dr.line([(0, Y), (view.width, Y)], fill=(0, 90, 255, 110 if major else 45), width=1)
        if major:
            dr.text((2, Y + 2), str(gy), fill=(0, 60, 200, 255), font=fnt)

    if not a.raw:
        only = set(a.only.split(',')) if a.only else None
        layers = rig.get('layers', [])
        for i, L in enumerate(layers):
            if only and L['id'] not in only:
                continue
            h = (i * 0.137) % 1
            r, gg, b = [int(c * 255) for c in colorsys.hsv_to_rgb(h, 0.9, 1)]
            for p in as_polys(L.get('poly')):
                pts = [T(q) for q in p]
                if len(pts) >= 3:
                    dr.polygon(pts, outline=(r, gg, b, 255), fill=(r, gg, b, 40))
                    dr.line(pts + [pts[0]], fill=(r, gg, b, 255), width=2)
                    cx = sum(q[0] for q in pts) / len(pts)
                    cy = sum(q[1] for q in pts) / len(pts)
                    dr.text((cx, cy), L['id'], fill=(0, 0, 0, 255), font=fnt, stroke_width=2, stroke_fill=(255, 255, 255, 255))
            for p in fill_polys(L.get('fill')):
                pts = [T(q) for q in p]
                for k in range(len(pts)):
                    if k % 2 == 0:
                        dr.line([pts[k], pts[(k + 1) % len(pts)]], fill=(255, 255, 255, 230), width=2)
            if L.get('sway'):
                S = L['sway']
                a0 = T(S['root'])
                a1 = T((S['root'][0] + S['dir'][0], S['root'][1] + S['dir'][1]))
                dr.line([a0, a1], fill=(r, gg, b, 255), width=3)
                dr.ellipse([a0[0] - 4, a0[1] - 4, a0[0] + 4, a0[1] + 4], fill=(r, gg, b, 255))
        for name, bone in rig.get('bones', {}).items():
            p = T(bone['pivot'])
            dr.ellipse([p[0] - 7, p[1] - 7, p[0] + 7, p[1] + 7], outline=(255, 0, 90, 255), width=3)
            dr.line([(p[0] - 11, p[1]), (p[0] + 11, p[1])], fill=(255, 0, 90, 255), width=2)
            dr.line([(p[0], p[1] - 11), (p[0], p[1] + 11)], fill=(255, 0, 90, 255), width=2)
            dr.text((p[0] + 9, p[1] - 20), name, fill=(255, 0, 90, 255), font=fnt, stroke_width=2, stroke_fill=(255, 255, 255, 255))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    view.convert('RGB').save(a.out)
    print('saved', a.out, view.size, f'(1 输出像素 = {1 / scale:.2f} 原画像素)')


if __name__ == '__main__':
    main()
