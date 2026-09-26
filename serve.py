"""艾雅法拉展示页 · 静态服务器

用法：
    python serve.py                 # 默认 0.0.0.0:25568，供 DDNS 外网访问
    python serve.py --port 8000     # 换端口
    python serve.py --host 127.0.0.1  # 只在本机访问

只提供本目录下的网页文件：不列目录，拒绝以 “.” 开头的路径（如 .claude/）和本脚本自身。

为手机 / 外网访问做的优化：
  - 文本类文件（js / css / html / json / svg / md）按浏览器的 Accept-Encoding 用 gzip 压缩（压缩结果按文件修改时间缓存在内存里）
  - 支持 Range 请求（206 分段）：音频可以边下边播、随意拖动
  - HTTP/1.1 长连接：几十个小文件不必每个都重新握手
  - 条件请求：文件没变就回 304
"""
import argparse
import email.utils
import gzip
import io
import os
import re
import sys
import threading
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
HIDDEN = {'serve.py', 'serve.bat'}
# 值得压缩的类型（图片、音频本身已经压缩过）
ZIP_EXT = ('.js', '.mjs', '.css', '.html', '.htm', '.json', '.svg', '.md', '.txt', '.xml', '.atlas', '.skel')
ZIP_MIN = 1024
_zip_cache = {}          # 路径 → (mtime, size, gzip 字节)
_zip_lock = threading.Lock()
_RANGE = re.compile(r'^bytes=(\d*)-(\d*)$')


def _gzip_bytes(path, st):
    key = path
    with _zip_lock:
        hit = _zip_cache.get(key)
        if hit and hit[0] == st.st_mtime_ns and hit[1] == st.st_size:
            return hit[2]
    with open(path, 'rb') as f:
        raw = f.read()
    data = gzip.compress(raw, compresslevel=6, mtime=0)
    with _zip_lock:
        _zip_cache[key] = (st.st_mtime_ns, st.st_size, data)
    return data


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    timeout = 75          # 空闲的长连接 75 秒后关掉，不让线程一直挂着
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.md': 'text/markdown; charset=utf-8',
        '.webp': 'image/webp',
        '.mp3': 'audio/mpeg',
    }

    def _blocked(self):
        parts = [p for p in self.path.split('?', 1)[0].split('#', 1)[0].split('/') if p]
        return any(p.startswith('.') for p in parts) or (parts and parts[-1] in HIDDEN)

    def _cache_control(self, path):
        p = path.replace('\\', '/')
        if '/assets/music/' in p and p.endswith('.mp3') or '/assets/puppet/' in p:
            return 'public, max-age=86400'
        if p.endswith(('.js', '.css')):
            return 'public, max-age=600'
        return 'no-cache'

    def send_head(self):
        if self._blocked():
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            # 目录（index.html、补斜杠的重定向）与 404 交给标准实现
            return super().send_head()
        try:
            st = os.stat(path)
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        ctype = self.guess_type(path)
        last_mod = self.date_time_string(st.st_mtime)
        etag = '"%x-%x"' % (st.st_mtime_ns, st.st_size)
        self._cc = self._cache_control(path)

        # 条件请求：没变就 304
        inm = self.headers.get('If-None-Match')
        ims = self.headers.get('If-Modified-Since')
        not_modified = False
        if inm is not None:
            not_modified = etag in [t.strip() for t in inm.split(',')] or inm.strip() == '*'
        elif ims:
            try:
                since = email.utils.parsedate_to_datetime(ims)
                not_modified = int(st.st_mtime) <= int(since.timestamp())
            except (TypeError, ValueError, IndexError, OverflowError):
                pass
        if not_modified:
            self.send_response(HTTPStatus.NOT_MODIFIED)
            self.send_header('ETag', etag)
            self.send_header('Last-Modified', last_mod)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None

        rng = self.headers.get('Range')
        want_zip = (path.lower().endswith(ZIP_EXT) and st.st_size >= ZIP_MIN and not rng
                    and 'gzip' in (self.headers.get('Accept-Encoding') or '').lower())

        # 分段请求（音频拖动 / 边下边播）
        if rng:
            m = _RANGE.match(rng.strip())
            size = st.st_size
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                else:
                    n = int(m.group(2))
                    start, end = max(0, size - n), size - 1
                end = min(end, size - 1)
                if start >= size or start > end:
                    self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    self.send_header('Content-Range', 'bytes */%d' % size)
                    self.send_header('Content-Length', '0')
                    self.end_headers()
                    return None
                with open(path, 'rb') as f:
                    f.seek(start)
                    body = f.read(end - start + 1)
                self.send_response(HTTPStatus.PARTIAL_CONTENT)
                self.send_header('Content-Type', ctype)
                self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('ETag', etag)
                self.send_header('Last-Modified', last_mod)
                self.end_headers()
                return io.BytesIO(body)
            # 看不懂的 Range：按整份返回

        if want_zip:
            try:
                body = _gzip_bytes(path, st)
            except OSError:
                self.send_error(HTTPStatus.NOT_FOUND)
                return None
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Vary', 'Accept-Encoding')
            self.send_header('ETag', etag)
            self.send_header('Last-Modified', last_mod)
            self.end_headers()
            return io.BytesIO(body)

        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        self.send_response(HTTPStatus.OK)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(st.st_size))
        self.send_header('Accept-Ranges', 'bytes')
        if path.lower().endswith(ZIP_EXT):
            self.send_header('Vary', 'Accept-Encoding')
        self.send_header('ETag', etag)
        self.send_header('Last-Modified', last_mod)
        self.end_headers()
        return f

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND)
        return None

    def end_headers(self):
        # 页面本身短缓存，便于更新后很快生效；脚本与样式稍长；音乐与原画一天
        cc = getattr(self, '_cc', None)
        if cc is None:
            path = self.path.split('?', 1)[0]
            cc = 'public, max-age=600' if path.endswith(('.js', '.css')) else 'no-cache'
        self.send_header('Cache-Control', cc)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self._cc = None
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('[%s] %s %s\n' % (self.log_date_time_string(), self.client_address[0], fmt % args))


def main():
    ap = argparse.ArgumentParser(description='艾雅法拉展示页静态服务器')
    ap.add_argument('--host', default='0.0.0.0')
    ap.add_argument('--port', type=int, default=25568)
    args = ap.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=ROOT))
    server.daemon_threads = True
    print(f'艾雅法拉展示页已启动：http://{args.host}:{args.port}/   （Ctrl+C 停止）')
    # 外网域名不写进代码（仓库是公开的）：在环境变量 EYJA_DDNS 里设置，例如 set EYJA_DDNS=example.ddns.net
    ddns = os.environ.get('EYJA_DDNS', '').strip()
    if ddns:
        print(f'外网地址（需路由器转发 TCP {args.port}）：http://{ddns}:{args.port}/')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
