"""Rebuild lossless runtime art from the retained PNG masters; requires cwebp."""
from pathlib import Path
import subprocess
import struct
import tempfile
import zlib


def rgba(path):
    """Read our non-interlaced RGB/RGBA 8-bit PNG masters for exact verification."""
    data = path.read_bytes()
    offset, compressed = 8, bytearray()
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind, payload = data[offset + 4:offset + 8], data[offset + 8:offset + 8 + length]
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
            assert depth == 8 and color in (2, 6) and interlace == 0
            channels = 4 if color == 6 else 3
        elif kind == b'IDAT':
            compressed.extend(payload)
        offset += length + 12
    raw, stride = zlib.decompress(compressed), width * channels
    previous, pixels = bytearray(stride), bytearray()
    for y in range(height):
        start = y * (stride + 1)
        method, row = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        for x in range(stride):
            left = row[x - channels] if x >= channels else 0
            above = previous[x]
            corner = previous[x - channels] if x >= channels else 0
            if method == 0: predictor = 0
            elif method == 1: predictor = left
            elif method == 2: predictor = above
            elif method == 3: predictor = (left + above) // 2
            elif method == 4:
                p = left + above - corner
                a, b, c = abs(p - left), abs(p - above), abs(p - corner)
                predictor = left if a <= b and a <= c else above if b <= c else corner
            else: raise ValueError('Unsupported PNG filter')
            row[x] = (row[x] + predictor) & 255
        previous = row
        if channels == 4: pixels.extend(row)
        else:
            for x in range(0, stride, 3): pixels.extend(row[x:x + 3] + b'\xff')
    return width, height, pixels

root = Path(__file__).resolve().parents[1]
for source in sorted((root / 'public/assets/indigo').glob('*.png')):
    target = source.with_suffix('.webp')
    subprocess.run(['cwebp', '-quiet', '-lossless', '-exact', '-metadata', 'all', '-m', '6',
                    str(source), '-o', str(target)], check=True)
    with tempfile.TemporaryDirectory(prefix='chipchamp-art-') as directory:
        decoded = Path(directory) / 'decoded.png'
        subprocess.run(['dwebp', '-quiet', str(target), '-o', str(decoded)], check=True)
        if rgba(source) != rgba(decoded):
            raise ValueError(f'{source.name}: decoded RGBA pixels changed')
    print(f'{source.name}: {source.stat().st_size} → {target.stat().st_size} bytes')
