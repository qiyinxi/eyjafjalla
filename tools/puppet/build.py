"""原画分层绑定 · 构建脚本

把一张官方立绘按 tools/puppet/rigs/<key>.json 中手工描出的多边形切成图层，
为“会被上层挡住、动起来可能露出来”的区域补画（推拉金字塔插值），
打包成图集，输出到 assets/puppet/<key>/{atlas.webp, rig.json}，供 js/puppet.js 运行时做网格变形。

用法：
    python tools/puppet/build.py alter-e0            # 构建
    python tools/puppet/build.py alter-e0 --check    # 同时输出校验图（静止合成 vs 原图、图层一览）

rig 源文件格式见 tools/puppet/README.md。
"""
import argparse
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, '.cache')
MEDIA = 'https://media.prts.wiki/'


def load_source(rig):
    """读取原画（缓存在 tools/puppet/.cache，缺失时从 PRTS 下载）"""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, rig['key'] + '.png')
    if not os.path.exists(path):
        url = MEDIA + urllib.parse.quote(rig['src'])
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(req, timeout=90).read()
                break
            except Exception as e:  # 网络偶发超时
                print('download retry', attempt, e)
        else:
            raise SystemExit('无法下载原画：' + url)
        with open(path, 'wb') as f:
            f.write(data)
    im = Image.open(path).convert('RGBA')
    return np.asarray(im).astype(np.float32) / 255.0


def poly_mask(size, polys, feather=0.0):
    """多边形（可多个）→ 0..1 掩码；feather 为羽化半径（像素）"""
    w, h = size
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        if len(p) >= 3:
            d.polygon([tuple(map(float, q)) for q in p], fill=255)
    if feather and feather > 0:
        m = m.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(m).astype(np.float32) / 255.0


def as_polys(v):
    """"poly" 可以是单个多边形 [[x,y],...] 或多个 [[[x,y],...], ...]"""
    if not v:
        return []
    if isinstance(v[0][0], (int, float)):
        return [v]
    return v


def dilate(mask, r):
    """二值膨胀（用最大值滤波近似）"""
    if r <= 0:
        return mask
    im = Image.fromarray((mask * 255).astype(np.uint8))
    size = int(r) * 2 + 1
    return np.asarray(im.filter(ImageFilter.MaxFilter(size if size % 2 else size + 1))).astype(np.float32) / 255.0


def push_pull(rgb, known):
    """推拉金字塔插值：用已知像素（权重 known）平滑地填满整张图"""
    levels = []
    c = rgb * known[..., None]
    k = known.copy()
    while min(k.shape) > 2:
        levels.append((c, k))
        h, w = k.shape
        h2, w2 = h // 2 * 2, w // 2 * 2
        c2 = c[:h2, :w2]
        k2 = k[:h2, :w2]
        c = (c2[0::2, 0::2] + c2[1::2, 0::2] + c2[0::2, 1::2] + c2[1::2, 1::2])
        k = (k2[0::2, 0::2] + k2[1::2, 0::2] + k2[0::2, 1::2] + k2[1::2, 1::2])
        # 归一化，保持“颜色 × 权重”的形式
        s = np.maximum(k, 1e-6)
        c = c / s[..., None] * np.minimum(k, 1.0)[..., None]
        k = np.minimum(k, 1.0)
    # 自顶向下：未知处用上一层的值补
    fill = c / np.maximum(k, 1e-6)[..., None]
    # 最粗一层里仍有完全没有已知像素的格子：用全部已知像素的平均色，而不是 0（黑）——
    # 否则窄边缘包着大片空洞的补画会整片发暗
    empty = k <= 1e-6
    if empty.any():
        tot = float(known.sum())
        fill[empty] = (rgb * known[..., None]).sum(axis=(0, 1)) / tot if tot > 0 else 0.0
    for c0, k0 in reversed(levels):
        h, w = k0.shape
        up = np.repeat(np.repeat(fill, 2, axis=0), 2, axis=1)
        if up.shape[0] < h:
            up = np.concatenate([up, up[-1:]], axis=0)
        if up.shape[1] < w:
            up = np.concatenate([up, up[:, -1:]], axis=1)
        up = up[:h, :w]
        # 轻微模糊，避免块状
        up = np.asarray(Image.fromarray(np.clip(up * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(1))).astype(np.float32) / 255.0
        known_c = c0 / np.maximum(k0, 1e-6)[..., None]
        kk = np.clip(k0, 0, 1)[..., None]
        fill = known_c * kk + up * (1 - kk)
    return fill


def smear_fill(rgb, known, region, direction, reach=80):
    """沿方向“拉丝”补画：未知像素沿 ±direction 找最近的已知像素，按距离加权混合两侧。
    适合发束、衣褶这类有方向纹理的区域（插值会糊，拉丝能延续笔触）。"""
    H, W = known.shape
    dx, dy = direction
    n = math.hypot(dx, dy) or 1.0
    dx, dy = dx / n, dy / n
    out = rgb.copy()
    need = (region > 0.01) & (known < 0.5)
    res = []
    for sgn in (1, -1):
        col = np.zeros_like(rgb)
        dist = np.full((H, W), np.inf, np.float32)
        todo = need.copy()
        for s in range(1, int(reach) + 1):
            ox, oy = int(round(sgn * dx * s)), int(round(sgn * dy * s))
            # 源像素 (y+oy, x+ox)
            ys0, ys1 = max(0, -oy), min(H, H - oy)
            xs0, xs1 = max(0, -ox), min(W, W - ox)
            if ys1 <= ys0 or xs1 <= xs0:
                break
            src_known = np.zeros((H, W), bool)
            src_known[ys0:ys1, xs0:xs1] = known[ys0 + oy:ys1 + oy, xs0 + ox:xs1 + ox] > 0.5
            hit = todo & src_known
            if hit.any():
                src = np.zeros_like(rgb)
                src[ys0:ys1, xs0:xs1] = rgb[ys0 + oy:ys1 + oy, xs0 + ox:xs1 + ox]
                col[hit] = src[hit]
                dist[hit] = s
                todo &= ~hit
            if not todo.any():
                break
        res.append((col, dist))
    (cf, df), (cb, db) = res
    has_f, has_b = np.isfinite(df), np.isfinite(db)
    both = has_f & has_b
    # 只在两侧都有样本的像素上做除法（其余像素的距离是 inf，inf/inf 会报 RuntimeWarning）；结果与原先逐像素相同
    w_f = has_f.astype(np.float32)
    w_f[both] = db[both] / np.maximum(df[both] + db[both], 1e-6)
    mix = cf * w_f[..., None] + cb * (1 - w_f[..., None])
    got = need & (has_f | has_b)
    out[got] = mix[got]
    # 两侧都找不到的像素：退回插值
    miss = need & ~(has_f | has_b)
    if miss.any():
        pp = push_pull(rgb, known)
        out[miss] = pp[miss]
    return out


def cv_fill(rgb, known, need, mode='telea', radius=5, patch=9, search=70, guide=0.35, vote=3, stride=3):
    """OpenCV 补画（可选，fill 写 {"poly", "cv": "telea" | "ns" | "patch"}）。
    rgb: 裁剪区 HxWx3 (0..1)；known: 可作为来源的像素（本层自有、不透明）；need: 要补的像素。
      telea / ns：cv2.inpaint（快速行进 / Navier-Stokes），沿等照度线延续，比推拉插值锐利；
      patch：样例块复制（Criminisi 式），从本层完好的区域整块拷贝纹理（布料褶皱、发丝），不会糊。
    只补 need 里的像素，其余原样返回。"""
    import cv2  # 仅在用到时才导入，不影响其他绑定
    out = rgb.copy()
    known = known.astype(bool)
    need = need.astype(bool) & ~known
    if not need.any() or not known.any():
        return out
    if mode in ('telea', 'ns'):
        img8 = np.clip(rgb * 255 + 0.5, 0, 255).astype(np.uint8)
        mask = (~known).astype(np.uint8) * 255      # 所有非来源像素都当作未知，避免从别的图层取色
        flag = cv2.INPAINT_TELEA if mode == 'telea' else cv2.INPAINT_NS
        res = cv2.inpaint(img8, mask, float(radius), flag).astype(np.float32) / 255.0
        out[need] = res[need]
        return out
    if mode != 'patch':
        raise ValueError('unknown cv fill mode: ' + str(mode))
    return exemplar_fill(rgb, known, need, patch=patch, search=search, guide=guide, vote=vote, stride=stride)


def exemplar_fill(rgb, known, need, patch=9, search=70, guide=0.35, vote=3, stride=3, vote_search=45):
    """样例块补画：按优先级（置信度 × 结构项）从填补前沿挑一个点，在 search 范围内找与其已知部分最像的完整来源块，
    把块里未知的像素拷过去；重复直到填满。来源块必须完全落在 known 里，所以只会复制本层自己的纹理。
    guide > 0 时，模板里未知的像素用推拉插值的平滑估计代替（权重 guide），选中的块在明暗 / 色调上也要对得上，
    避免把描线、暗部的碎片拷进大片浅色布料里。"""
    import cv2
    H, W = known.shape
    p = int(patch) | 1
    h = p // 2
    img = rgb.astype(np.float32).copy()
    filled = known.copy()
    gd = push_pull(img, known.astype(np.float32)).astype(np.float32) if guide > 0 else None
    img[~filled] = 0
    conf = filled.astype(np.float32)
    todo = need & ~filled
    # 来源块中心：以它为中心的 p×p 块全部已知
    src_ok = cv2.erode(known.astype(np.uint8), np.ones((p, p), np.uint8), borderValue=0) > 0
    if not src_ok.any():
        return push_pull_fallback(rgb, known, need)
    gray = cv2.cvtColor(np.clip(rgb, 0, 1).astype(np.float32), cv2.COLOR_RGB2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    kernel3 = np.ones((3, 3), np.uint8)
    guard = int(todo.sum()) * 2 + 100
    while todo.any() and guard > 0:
        guard -= 1
        front = todo & (cv2.dilate(filled.astype(np.uint8), kernel3) > 0)
        if not front.any():
            break
        # 置信度：块内已填像素的平均置信度
        C = cv2.boxFilter(conf, -1, (p, p), normalize=True, borderType=cv2.BORDER_CONSTANT)
        # 结构项：前沿法向 · 等照度线（梯度旋转 90°），越强越先填，线条能延续进来
        fm = filled.astype(np.float32)
        nx = cv2.Sobel(fm, cv2.CV_32F, 1, 0, ksize=3)
        ny = cv2.Sobel(fm, cv2.CV_32F, 0, 1, ksize=3)
        nn = np.sqrt(nx * nx + ny * ny) + 1e-6
        # 只用已知像素的梯度（未知处为 0），取邻域最大值
        gxk = np.where(filled, gx, 0)
        gyk = np.where(filled, gy, 0)
        Dm = np.abs(-gyk * nx / nn + gxk * ny / nn)
        Dm = cv2.dilate(Dm, kernel3)
        pr = np.where(front, C * (Dm + 0.02), -1)
        cy, cx = np.unravel_index(int(np.argmax(pr)), pr.shape)
        # 目标块（贴边时平移到图内）
        ty0, tx0 = min(max(cy - h, 0), H - p), min(max(cx - h, 0), W - p)
        tmask = filled[ty0:ty0 + p, tx0:tx0 + p].astype(np.float32)
        tgt = todo[ty0:ty0 + p, tx0:tx0 + p]
        tpl = img[ty0:ty0 + p, tx0:tx0 + p]
        wmask = tmask
        if gd is not None:
            tpl = np.where(tmask[..., None] > 0, tpl, gd[ty0:ty0 + p, tx0:tx0 + p]).astype(np.float32)
            wmask = tmask + (1 - tmask) * float(guide)
        # 搜索窗
        wy0, wy1 = max(0, ty0 - search), min(H, ty0 + p + search)
        wx0, wx1 = max(0, tx0 - search), min(W, tx0 + p + search)
        win = img[wy0:wy1, wx0:wx1]
        best = None
        if tmask.sum() > 0 and win.shape[0] >= p and win.shape[1] >= p:
            m3 = np.repeat(wmask[..., None], 3, axis=2).astype(np.float32)
            score = cv2.matchTemplate(win, tpl, cv2.TM_SQDIFF, mask=m3)
            okc = src_ok[wy0 + h:wy1 - h, wx0 + h:wx1 - h]
            okc = okc[:score.shape[0], :score.shape[1]]
            if okc.any():
                score = np.where(okc, score, np.inf)
                # 距离略加惩罚：相似度差不多时取近处的块（颜色 / 光照更接近）
                yy, xx = np.mgrid[0:score.shape[0], 0:score.shape[1]]
                d2 = ((yy + wy0 - ty0) ** 2 + (xx + wx0 - tx0) ** 2).astype(np.float32)
                score = score + d2 * 1e-5 * max(1.0, float(tmask.sum()))
                by, bx = np.unravel_index(int(np.argmin(score)), score.shape)
                if np.isfinite(score[by, bx]):
                    best = (wy0 + by, wx0 + bx)
        sel = _full(tgt, ty0, tx0, H, W)
        if best is None:
            # 找不到来源块：这一块退回推拉插值
            pp = push_pull_fallback(img, filled, sel)
            img[sel] = pp[sel]
        else:
            sy, sx = best
            srcp = img[sy:sy + p, sx:sx + p]
            blk = img[ty0:ty0 + p, tx0:tx0 + p]
            blk[tgt] = srcp[tgt]
        cval = float(C[cy, cx])
        conf[sel] = cval
        filled |= sel
        todo &= ~sel
    if todo.any():
        pp = push_pull_fallback(img, filled, todo)
        img[todo] = pp[todo]
    if vote > 0:
        img = _patch_vote(img, known, need, src_ok, p, min(search, vote_search), int(vote), int(stride))
    out = rgb.copy()
    out[need] = img[need]
    return out


def _patch_vote(img, known, hole, src_ok, p, search, iters, stride):
    """Wexler 式补全的“投票”迭代：对覆盖补画区的每个块（按 stride 取样）重新找最近的来源块，
    把各来源块在补画区上的像素按高斯权重平均。块与块之间的接缝被平均掉，纹理仍来自原画。"""
    import cv2
    H, W = hole.shape
    h = p // 2
    valid = known | hole
    g1 = cv2.getGaussianKernel(p, p / 3.0).astype(np.float32)
    gw = (g1 @ g1.T)
    gw /= gw.max()
    ys, xs = np.nonzero(hole)
    cy0, cy1 = max(h, ys.min() - h), min(H - h - 1, ys.max() + h)
    cx0, cx1 = max(h, xs.min() - h), min(W - h - 1, xs.max() + h)
    hole_near = cv2.dilate(hole.astype(np.uint8), np.ones((p, p), np.uint8)) > 0
    centers = [(y, x) for y in range(cy0, cy1 + 1, stride) for x in range(cx0, cx1 + 1, stride) if hole_near[y, x]]
    wv = np.where(known, 1.0, np.where(hole, 0.8, 0.0)).astype(np.float32)
    for _ in range(iters):
        acc = np.zeros_like(img)
        wsum = np.zeros((H, W), np.float32)
        for (y, x) in centers:
            ty0, tx0 = y - h, x - h
            tpl = img[ty0:ty0 + p, tx0:tx0 + p]
            wm = wv[ty0:ty0 + p, tx0:tx0 + p]
            wy0, wy1 = max(0, ty0 - search), min(H, ty0 + p + search)
            wx0, wx1 = max(0, tx0 - search), min(W, tx0 + p + search)
            win = img[wy0:wy1, wx0:wx1]
            score = cv2.matchTemplate(win, tpl, cv2.TM_SQDIFF, mask=np.repeat(wm[..., None], 3, axis=2))
            okc = src_ok[wy0 + h:wy1 - h, wx0 + h:wx1 - h][:score.shape[0], :score.shape[1]]
            if not okc.any():
                continue
            score = np.where(okc, score, np.inf)
            by, bx = np.unravel_index(int(np.argmin(score)), score.shape)
            if not np.isfinite(score[by, bx]):
                continue
            sy, sx = wy0 + by, wx0 + bx
            tgt = hole[ty0:ty0 + p, tx0:tx0 + p]
            wgt = gw * tgt
            acc[ty0:ty0 + p, tx0:tx0 + p] += img[sy:sy + p, sx:sx + p] * wgt[..., None]
            wsum[ty0:ty0 + p, tx0:tx0 + p] += wgt
        upd = hole & (wsum > 1e-6)
        img = img.copy()
        img[upd] = acc[upd] / wsum[upd][:, None]
    return img


def _full(blockmask, y0, x0, H, W):
    m = np.zeros((H, W), bool)
    bh, bw = blockmask.shape
    m[y0:y0 + bh, x0:x0 + bw] = blockmask
    return m


def push_pull_fallback(rgb, known, need):
    return push_pull(rgb.astype(np.float32), known.astype(np.float32))


def pack(rects, max_w=4096, pad=8):
    """简单的货架式装箱：rects = [(w,h)] → [(x,y)], 图集尺寸"""
    order = sorted(range(len(rects)), key=lambda i: -rects[i][1])
    pos = [None] * len(rects)
    x = y = shelf_h = 0
    W = 0
    for i in order:
        w, h = rects[i]
        if x + w + pad > max_w:
            x = 0
            y += shelf_h + pad
            shelf_h = 0
        pos[i] = (x, y)
        x += w + pad
        W = max(W, x)
        shelf_h = max(shelf_h, h)
    H = y + shelf_h
    return pos, (min(max_w, W), H)


def hex_rgb(c):
    c = c.lstrip('#')
    return [int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]


def paint_layer(size, spec, orig):
    """合成图层（原画里没有的东西，例如闭眼的眼睑）：
    spec = { "fills": [{"poly": [...], "color": "#hex" | "sample": [x,y], "feather": 1.5}],
             "strokes": [{"pts": [[x,y],...], "width": 4, "color": "#hex" | "sample": [x,y], "taper": true}] }
    """
    W, H = size
    rgb = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)

    def over(col, m):
        """把颜色 col（常量或逐像素）以覆盖度 m 叠到当前层上（非预乘的正确合成，边缘不发灰）"""
        nonlocal rgb, alpha
        a_new = m + alpha * (1 - m)
        c = col if np.ndim(col) == 3 else np.broadcast_to(col, rgb.shape)
        rgb = np.where(a_new[..., None] > 1e-6, (c * m[..., None] + rgb * (alpha * (1 - m))[..., None]) / np.maximum(a_new, 1e-6)[..., None], c)
        alpha = a_new

    def color_of(o, key='color', skey='sample'):
        if skey in o:
            x, y = o[skey]
            r = int(o.get('r', 3))
            patch = orig[int(y) - r:int(y) + r + 1, int(x) - r:int(x) + r + 1, :3]
            return patch.reshape(-1, 3).mean(0)
        return np.array(hex_rgb(o.get(key, '#000000')))

    def shape_mask(f):
        # 多边形，或椭圆 "ellipse": [cx, cy, rx, ry, 旋转弧度]
        if 'ellipse' in f:
            cx, cy, rx, ry = f['ellipse'][:4]
            rot = f['ellipse'][4] if len(f['ellipse']) > 4 else 0.0
            pts = []
            for i in range(72):
                a = i / 72 * math.pi * 2
                x, y = rx * math.cos(a), ry * math.sin(a)
                pts.append([cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)])
            return poly_mask(size, [pts], f.get('feather', 1.5))
        return poly_mask(size, as_polys(f['poly']), f.get('feather', 1.5))

    for f in spec.get('fills', []):
        m = shape_mask(f) * f.get('alpha', 1.0)
        c = color_of(f)
        if 'color2' in f or 'sample2' in f:
            # 线性渐变：沿 axis（x / y）在形状包围盒内从 color 过渡到 color2
            c2 = color_of(f, 'color2', 'sample2')
            ys, xs = np.nonzero(m > 0.01)
            if len(xs):
                ax = f.get('axis', 'y')
                grid = np.arange(W if ax == 'x' else H, dtype=np.float32)
                lo, hi = (xs.min(), xs.max()) if ax == 'x' else (ys.min(), ys.max())
                k = np.clip((grid - lo) / max(1, hi - lo), 0, 1)
                k = k[None, :] if ax == 'x' else k[:, None]
                cc = c[None, None, :] * (1 - k[..., None]) + c2[None, None, :] * k[..., None]
                over(np.broadcast_to(cc, rgb.shape), m)
                continue
        over(c, m)
    for s in spec.get('strokes', []):
        # 线条：按点列画，taper 时两端变细（睫毛线）
        im = Image.new('L', (W * 2, H * 2), 0)
        d = ImageDraw.Draw(im)
        pts = [(p[0] * 2, p[1] * 2) for p in s['pts']]
        w = s.get('width', 3) * 2
        n = len(pts)
        for i in range(n - 1):
            t = i / max(1, n - 2)
            ww = w * (math.sin(math.pi * min(1, max(0, t))) * 0.7 + 0.3) if s.get('taper', True) else w
            d.line([pts[i], pts[i + 1]], fill=255, width=max(1, int(round(ww))))
            r = ww / 2
            d.ellipse([pts[i + 1][0] - r, pts[i + 1][1] - r, pts[i + 1][0] + r, pts[i + 1][1] + r], fill=255)
        im = im.resize((W, H), Image.LANCZOS)
        m = np.asarray(im).astype(np.float32) / 255.0 * s.get('alpha', 1.0)
        over(color_of(s), m)
    return np.dstack([rgb, alpha])


def build(key, check=False):
    src_path = os.path.join(HERE, 'rigs', key + '.json')
    with open(src_path, encoding='utf-8') as f:
        rig = json.load(f)
    rig['key'] = key
    orig = load_source(rig)
    H, W = orig.shape[:2]
    scale = rig.get('scale', 1.0)  # 若 rig 坐标基于其他分辨率，可在此换算
    A0 = orig[..., 3]
    layers = rig['layers']
    n = len(layers)

    def S(p):
        return [[q[0] * scale, q[1] * scale] for q in p]

    # 1) 自上而下计算每层“拥有”的像素（上层优先），rest 层拿剩余部分
    claimed = np.zeros((H, W), np.float32)
    own = [None] * n
    for i in reversed(range(n)):
        L = layers[i]
        if L.get('rest') or L.get('paint'):
            continue
        m = poly_mask((W, H), [S(p) for p in as_polys(L['poly'])], L.get('feather', 1.5))
        if L.get('minus'):
            m *= 1 - poly_mask((W, H), [S(p) for p in as_polys(L['minus'])], L.get('feather', 1.5))
        m_eff = m * (1 - claimed)
        own[i] = m_eff
        claimed = np.clip(claimed + m_eff, 0, 1)
    for i, L in enumerate(layers):
        if L.get('rest'):
            own[i] = 1 - claimed

    # 2) 逐层生成 RGBA：自有部分用原图；被上层挡住、可能露出的部分补画
    band = rig.get('band', 10)
    out_layers = []
    above = np.zeros((H, W), np.float32)
    rgba_layers = [None] * n
    for i in reversed(range(n)):
        L = layers[i]
        if L.get('paint'):
            # 合成图层：不参与切割，也不遮挡下层
            rgba_layers[i] = paint_layer((W, H), L['paint'], orig)
            continue
        m = own[i]
        vis = m > 0.5
        # 必须复制：下面的补画会就地写 rgb，若它是 orig 的视图，就会改坏原图，后面的图层读到的都是被改过的像素
        rgb = orig[..., :3].copy()
        alpha = A0 * m
        cover = above > 0.02  # 被上层（任何一层）覆盖的区域
        fill_region = np.zeros((H, W), np.float32)
        if not L.get('nofill'):
            fill_region = dilate(vis.astype(np.float32), band) * cover
        # fill 里可以是纯多边形（插值补画），也可以是 {"poly", "color"|"sample"}（纯色补画，例如眼睑的肤色）
        flat = []
        for f in L.get('fill', []) or []:
            if isinstance(f, dict):
                flat.append(f)
            else:
                fill_region = np.maximum(fill_region, poly_mask((W, H), [S(p) for p in as_polys(f)], 2) * cover)
        fill_region *= (A0 > 0.35)
        if fill_region.max() > 0 and vis.any():
            known = (m * (A0 > 0.5)).astype(np.float32)
            # 只在本层附近插值，节省时间
            ys, xs = np.nonzero(fill_region > 0.01)
            y0, y1 = max(0, ys.min() - 64), min(H, ys.max() + 64)
            x0, x1 = max(0, xs.min() - 64), min(W, xs.max() + 64)
            sub = push_pull(rgb[y0:y1, x0:x1], known[y0:y1, x0:x1])
            fr = fill_region[y0:y1, x0:x1]
            rgb = rgb.copy()
            region_rgb = rgb[y0:y1, x0:x1]
            # 补画区域里：本层哪怕只拥有一点（羽化边）也保留原图颜色，静止时才能与原图完全一致
            keep = (m[y0:y1, x0:x1] > 1e-3).astype(np.float32)[..., None]
            region_rgb[:] = region_rgb * keep + sub * (1 - keep) * (fr[..., None] > 0) + region_rgb * (1 - keep) * (fr[..., None] <= 0)
            alpha = np.maximum(alpha, fill_region * A0 * (1 - m) + alpha)
            alpha = np.clip(alpha, 0, 1)
        # 纯色 / 肤色插值补画：只作用于被上层覆盖、且本层不拥有的像素
        for f in flat:
            # 只补原图不透明的地方：背景（透明）后面不该凭空长出东西
            fm = poly_mask((W, H), [S(p) for p in as_polys(f['poly'])], f.get('feather', 1.5)) * cover * (1 - (m > 1e-3))
            fm *= np.clip((A0 - 0.15) / 0.5, 0, 1)
            if f.get('cv'):
                # OpenCV 补画（可选）：telea / ns 等照度线延续，patch 样例块复制纹理
                ys, xs = np.nonzero(fm > 0.01)
                if len(xs):
                    pad = int(f.get('reach', 60)) + 4
                    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
                    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad)
                    sub = orig[y0:y1, x0:x1, :3]
                    known = (m[y0:y1, x0:x1] > 0.5) & (A0[y0:y1, x0:x1] > 0.9)
                    if f.get('minLum') is not None:
                        known &= (sub @ np.array([0.299, 0.587, 0.114], np.float32)) >= f['minLum']
                    filled = cv_fill(sub, known, fm[y0:y1, x0:x1] > 0.01, f['cv'], f.get('radius', 5),
                                     f.get('patch', 9), f.get('search', 70), f.get('guide', 0.35),
                                     f.get('vote', 3), f.get('stride', 3))
                    fr = fm[y0:y1, x0:x1][..., None]
                    rgb[y0:y1, x0:x1] = rgb[y0:y1, x0:x1] * (1 - fr) + filled * fr
                    alpha = np.maximum(alpha, fm * A0)
                continue
            if f.get('smear'):
                # 沿方向拉丝补画（发束、衣褶）
                ys, xs = np.nonzero(fm > 0.01)
                if len(xs):
                    pad = int(f.get('reach', 80)) + 4
                    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
                    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad)
                    known = ((m[y0:y1, x0:x1] > 0.5) & (A0[y0:y1, x0:x1] > 0.9)).astype(np.float32)
                    filled = smear_fill(orig[y0:y1, x0:x1, :3], known, fm[y0:y1, x0:x1], f['smear'], f.get('reach', 80))
                    fr = fm[y0:y1, x0:x1][..., None]
                    rgb[y0:y1, x0:x1] = rgb[y0:y1, x0:x1] * (1 - fr) + filled * fr
                    alpha = np.maximum(alpha, fm * A0)
                continue
            if f.get('inpaint'):
                # 只用周围足够亮（例如肤色）的像素做平滑插值，避免把睫毛、发丝的暗色带进来
                ys, xs = np.nonzero(fm > 0.01)
                if len(xs):
                    pad = int(f.get('reach', 40))
                    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
                    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad)
                    sub = orig[y0:y1, x0:x1, :3]
                    lum = sub @ np.array([0.299, 0.587, 0.114], np.float32)
                    known = ((m[y0:y1, x0:x1] > 0.5) & (lum >= f.get('minLum', 0.0)) & (A0[y0:y1, x0:x1] > 0.9)).astype(np.float32)
                    fillc = push_pull(sub, known)
                    fr = fm[y0:y1, x0:x1][..., None]
                    rgb[y0:y1, x0:x1] = rgb[y0:y1, x0:x1] * (1 - fr) + fillc * fr
                    alpha = np.maximum(alpha, fm * A0)
                continue
            if 'sample' in f:
                x, y = f['sample']
                r = int(f.get('r', 3))
                c = orig[int(y) - r:int(y) + r + 1, int(x) - r:int(x) + r + 1, :3].reshape(-1, 3).mean(0)
            else:
                c = np.array(hex_rgb(f['color']))
            rgb = rgb * (1 - fm[..., None]) + c * fm[..., None]
            alpha = np.maximum(alpha, fm * A0)
        # 上层羽化边下面，本层保持原图的不透明度（颜色也是原图），静止合成才无缝
        edge = (m > 1e-3) & cover
        alpha = np.where(edge, np.maximum(alpha, A0), alpha)
        rgba_layers[i] = np.dstack([rgb, alpha])
        above = np.clip(above + m, 0, 1)

    # 3) 裁剪、装箱
    crops = []
    for i, L in enumerate(layers):
        a = rgba_layers[i][..., 3]
        ys, xs = np.nonzero(a > 0.004)
        if len(xs) == 0:
            crops.append(None)
            continue
        pad = 2
        x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + 1 + pad)
        y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + 1 + pad)
        crops.append((int(x0), int(y0), int(x1 - x0), int(y1 - y0)))
    rects = [(c[2], c[3]) if c else (0, 0) for c in crops]
    pos, (AW, AH) = pack(rects)
    atlas = np.zeros((AH, AW, 4), np.float32)
    for i, c in enumerate(crops):
        if not c:
            continue
        x0, y0, w, h = c
        ax, ay = pos[i]
        atlas[ay:ay + h, ax:ax + w] = rgba_layers[i][y0:y0 + h, x0:x0 + w]

    # 4) 网格：按步长划分，保留有内容的格子（外扩一格）
    out = {
        'key': key, 'w': W, 'h': H, 'atlas': 'atlas.webp', 'atlasW': AW, 'atlasH': AH,
        'bones': rig.get('bones', {}), 'params': rig.get('params', {}), 'eyes': rig.get('eyes', []),
        'anchors': rig.get('anchors', {}), 'v': int(time.time()),
        'layers': [],
    }
    for i, L in enumerate(layers):
        c = crops[i]
        if not c:
            continue
        x0, y0, w, h = c
        step = L.get('step', rig.get('step', 20))
        cols, rows = max(1, math.ceil(w / step)), max(1, math.ceil(h / step))
        a = rgba_layers[i][y0:y0 + h, x0:x0 + w, 3]
        occ = np.zeros((rows, cols), bool)
        for r in range(rows):
            for q in range(cols):
                blk = a[r * step:(r + 1) * step, q * step:(q + 1) * step]
                occ[r, q] = blk.size > 0 and blk.max() > 0.004
        # 外扩一格，保证变形时边缘不被裁掉
        occ2 = occ.copy()
        occ2[1:, :] |= occ[:-1, :]
        occ2[:-1, :] |= occ[1:, :]
        occ2[:, 1:] |= occ[:, :-1]
        occ2[:, :-1] |= occ[:, 1:]
        entry = {k: v for k, v in L.items() if k not in ('poly', 'minus', 'fill', 'rest', 'feather', 'nofill', 'paint')}
        entry.update({
            'rect': [int(x0), int(y0), int(w), int(h)], 'at': [int(pos[i][0]), int(pos[i][1])],
            'step': step, 'cols': cols, 'rows': rows, 'occ': ''.join('1' if v else '0' for v in occ2.flatten()),
        })
        out['layers'].append(entry)

    dst = os.path.join(ROOT, 'assets', 'puppet', key)
    os.makedirs(dst, exist_ok=True)
    im = Image.fromarray(np.clip(atlas * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    im.save(os.path.join(dst, 'atlas.webp'), 'WEBP', quality=92, method=5)
    with open(os.path.join(dst, 'rig.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{key}: {len(out["layers"])} layers, atlas {AW}x{AH}, source {W}x{H}')

    if check:
        chk = os.path.join(HERE, '.cache', key + '-check')
        os.makedirs(chk, exist_ok=True)
        # 静止合成（premultiplied over）应与原图一致
        comp = np.zeros((H, W, 4), np.float32)
        for i in range(n):
            if rgba_layers[i] is None or layers[i].get('paint'):
                continue
            c = rgba_layers[i]
            a = c[..., 3:4]
            comp[..., :3] = c[..., :3] * a + comp[..., :3] * (1 - a)
            comp[..., 3:4] = a + comp[..., 3:4] * (1 - a)
        # comp 的颜色已是预乘形式
        err = np.maximum(np.abs(comp[..., :3] - orig[..., :3] * orig[..., 3:4]).max(axis=2), np.abs(comp[..., 3] - orig[..., 3]))
        print(f'rest composite max err {err.max():.3f}, mean {err.mean():.5f}, >0.1 px: {(err > 0.1).sum()}')
        Image.fromarray(np.clip(err * 4 * 255, 0, 255).astype(np.uint8)).save(os.path.join(chk, 'error.png'))
        # 每层单独输出（棋盘底），便于检查切割和补画
        for i, L in enumerate(layers):
            if rgba_layers[i] is None or not crops[i]:
                continue
            x0, y0, w, h = crops[i]
            c = rgba_layers[i][y0:y0 + h, x0:x0 + w]
            yy, xx = np.mgrid[0:h, 0:w]
            board = np.where(((yy // 16 + xx // 16) % 2)[..., None] == 0, 0.85, 0.65)
            img = c[..., :3] * c[..., 3:4] + board * (1 - c[..., 3:4])
            Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8)).save(os.path.join(chk, f'{i:02d}-{L["id"]}.png'))
        print('check images →', chk)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('key')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    build(a.key, a.check)
