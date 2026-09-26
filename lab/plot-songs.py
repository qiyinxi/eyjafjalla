"""把 assets/music/<song>.json 画成一张结构图（开发用）：响度、低 / 中 / 高频、段落候选边界、小节线
用法：python lab/plot-songs.py <out_dir> [song ...]
"""
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
songs = sys.argv[2:] or ['before-summer', 'misty-memory-night', 'miss-you', 'misty-memory-day', 'effervescence']
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 13)
except Exception:
    font = ImageFont.load_default()

for song in songs:
    d = json.load(open(f'assets/music/{song}.json', encoding='utf-8'))
    dur = d['duration']
    W, H = 2400, 520
    im = Image.new('RGB', (W, H), (18, 14, 20))
    g = ImageDraw.Draw(im)
    X = lambda t: 40 + (W - 80) * t / dur
    env = d['env']
    R = env['rate']
    def smooth(a, k=5):
        a = np.array(a, float)
        return np.convolve(a, np.ones(k) / k, mode='same')
    rows = [('rms', (255, 150, 190), 60, 190), ('low', (255, 120, 60), 200, 300), ('mid', (120, 200, 255), 310, 400), ('high', (200, 255, 160), 410, 490)]
    for key, col, y0, y1 in rows:
        a = smooth(env[key])
        pts = [(X(i / R), y1 - (y1 - y0) * v / 255) for i, v in enumerate(a)]
        g.line(pts, fill=col, width=1)
        g.text((4, y0), key, fill=col, font=font)
    # 小节线
    for i, t in enumerate(d['downbeats']):
        g.line([(X(t), 50), (X(t), 52 + (6 if i % 4 == 0 else 2))], fill=(90, 80, 100))
        if i % 8 == 0:
            g.text((X(t) + 2, 36), str(i), fill=(120, 110, 130), font=font)
    # 段落候选
    for b in d['bounds']:
        x = X(b['t'])
        g.line([(x, 56), (x, H - 20)], fill=(255, 220, 90) if b['strength'] > 30 else (150, 130, 60), width=2 if b['strength'] > 30 else 1)
        g.text((x + 3, H - 18), f"{b['t']:.1f}", fill=(255, 220, 90), font=font)
    # 时间刻度
    for s in range(0, int(dur) + 1, 10):
        g.line([(X(s), H - 24), (X(s), H - 20)], fill=(160, 160, 160))
        if s % 30 == 0:
            g.text((X(s) - 8, 4), f'{s // 60}:{s % 60:02d}', fill=(200, 200, 200), font=font)
    g.text((W - 520, 4), f"{song}  {d['tempo']} BPM  {len(d['downbeats'])} bars  {dur:.1f}s", fill=(255, 255, 255), font=font)
    im.save(os.path.join(out, f'{song}-structure.png'))
    print('saved', song)
