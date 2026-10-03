"""
官方素材的超分辨率放大（开发用，离线跑一次，结果提交进仓库）

    python tools/upscale/upscale.py --spine            # assets/official/spine/enemy_spine/*/*.png → 原地换成 2 倍（原图备份到 .orig/）
    python tools/upscale/upscale.py --keyart keller    # assets/puppet/<key>/atlas.webp → atlas@2x.webp，并在 rig.json 里写上 atlas2
    python tools/upscale/upscale.py --keyart all

运行时怎么用：
  - js/mv/sd.js：贴图正好是图集声明尺寸的 2～4 倍时保留原尺寸、图集坐标同比放大（触屏设备照旧缩回声明尺寸）
  - js/mv/keyart.js：rig.json 有 atlas2 时，桌面、内存 ≥ 4GB 的设备用 2 倍图集，否则用原图集

放大用 Real-ESRGAN（ncnn 版，模型随 pip 包一起装，不用另外下载；没有显卡时用 Mesa 的 lavapipe 跑 Vulkan，CPU 上也能跑，只是慢）：
    python -m venv .venv && . .venv/bin/activate && pip install realesrgan-ncnn-py pillow numpy
    apt-get install libomp5 mesa-vulkan-drivers        # Linux 上缺这两个时
    VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json python tools/upscale/upscale.py --spine
不要用通用的生图 AI 放大：它们会重画细节，同一角色的几张差分 / 一张图集里的各个部件放大后对不齐。

  - 小羊贴图（512²，画面上常被放大 2～3.6 倍）：realesrgan-x4plus-anime 放大 4 倍再 Lanczos 缩到 2 倍（最清楚，CPU 上一张约 8 分钟）
  - 立绘图集（几百万像素）：realesr-animevideov3-x2 直接放大 2 倍（快得多，一张几分钟）
  - 预乘透明的贴图（spine）：放大后把颜色压回不超过透明度，否则边缘会发光
"""
import argparse, glob, json, os, shutil, sys, time
import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
_R = {}


def upscaler(model):
    from realesrgan_ncnn_py import Realesrgan
    if model not in _R:
        _R[model] = Realesrgan(gpuid=0, model=model)  # 0 = realesr-animevideov3-x2，4 = realesrgan-x4plus-anime
    return _R[model]


def up2(im, best):
    w, h = im.size
    if best:
        return upscaler(4).process_pil(im).resize((w * 2, h * 2), Image.LANCZOS)
    o = upscaler(0).process_pil(im)
    return o if o.size == (w * 2, h * 2) else o.resize((w * 2, h * 2), Image.LANCZOS)


def pma_fix(im):
    a = np.asarray(im.convert('RGBA')).copy()
    a[..., :3] = np.minimum(a[..., :3], a[..., 3:4])
    return Image.fromarray(a, 'RGBA')


def do_spine(files):
    for f in files:
        im = Image.open(f).convert('RGBA')
        bak = os.path.join(os.path.dirname(f), '.orig', os.path.basename(f))
        if os.path.exists(bak):
            print('跳过（已放大过）', f); continue
        atlas = os.path.splitext(f)[0] + '.atlas'
        decl = None
        if os.path.exists(atlas):
            for line in open(atlas, encoding='utf-8'):
                if line.strip().startswith('size:'):
                    decl = tuple(int(v) for v in line.split(':')[1].split(',')); break
        if decl and im.size != decl:
            print('跳过（尺寸和图集声明不一致）', f, im.size, decl); continue
        t = time.time()
        out = pma_fix(up2(im, True))
        os.makedirs(os.path.dirname(bak), exist_ok=True)
        shutil.copy2(f, bak)
        out.save(f, optimize=True)
        print(os.path.relpath(f, ROOT), im.size, '→', out.size, round(time.time() - t), 's', flush=True)


def do_keyart(keys):
    for key in keys:
        d = os.path.join(ROOT, 'assets', 'puppet', key)
        rj = os.path.join(d, 'rig.json')
        rig = json.load(open(rj, encoding='utf-8'))
        t = time.time()
        im = Image.open(os.path.join(d, rig['atlas'])).convert('RGBA')
        if im.size != (rig['atlasW'], rig['atlasH']):
            print('跳过（图集尺寸和 rig.json 不一致）', key); continue
        out = up2(im, False)
        out.save(os.path.join(d, 'atlas@2x.webp'), 'WEBP', quality=90, method=5)
        rig['atlas2'] = 'atlas@2x.webp'
        with open(rj, 'w', encoding='utf-8') as fo:
            json.dump(rig, fo, ensure_ascii=False, separators=(',', ':'))
        print(key, im.size, '→', out.size, round(time.time() - t), 's', flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--spine', nargs='*', help='贴图路径；不给 = 全部小羊贴图')
    ap.add_argument('--keyart', nargs='*', help="assets/puppet 下的 key；'all' = 全部")
    a = ap.parse_args()
    if a.spine is not None:
        do_spine(a.spine or sorted(glob.glob(os.path.join(ROOT, 'assets/official/spine/enemy_spine/*/*.png'))))
    if a.keyart is not None:
        ks = a.keyart if a.keyart and a.keyart != ['all'] else sorted(os.path.basename(p) for p in glob.glob(os.path.join(ROOT, 'assets/puppet/*')))
        do_keyart(ks)
    if a.spine is None and a.keyart is None:
        ap.print_help(); sys.exit(1)
