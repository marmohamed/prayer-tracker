"""Generate crisp, antialiased PNG icons with Python's standard library only."""
import math, struct, zlib
from pathlib import Path
root = Path(__file__).resolve().parent.parent / 'public'
svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#235b48"/><path d="M306 110a108 108 0 1 0 96 155 103 103 0 0 1-96-155Z" fill="#f4e8c9"/><path d="M170 354h172m-148 34h124" fill="none" stroke="#f4e8c9" stroke-width="15" stroke-linecap="round"/></svg>'
(root / 'favicon.svg').write_text(svg)
bg, fg = (35,91,72), (244,232,201)
def color(x,y):
    # Crescent and two lines; all foreground within maskable safe circle.
    outer = (x-256)**2+(y-214)**2 < 108**2
    inner = (x-308)**2+(y-173)**2 < 103**2
    lines = any((max(a-x,0,x-b)**2+(y-c)**2 < 7.5**2) for a,b,c in [(170,342,354),(194,318,388)])
    return fg if (outer and not inner) or lines else bg
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
for name,size in [('icon-192.png',192),('icon-512.png',512),('maskable-512.png',512)]:
    rows=[]
    for y in range(size):
        row=bytearray([0])
        for x in range(size):
            samples=[color((x+(sx+.5)/3)*512/size,(y+(sy+.5)/3)*512/size) for sy in range(3) for sx in range(3)]
            row.extend(round(sum(p[i] for p in samples)/9) for i in range(3))
        rows.append(bytes(row))
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')
    (root/'icons'/name).write_bytes(png)
