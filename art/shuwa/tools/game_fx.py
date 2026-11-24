"""SHUWA's effect images for the game, drawn in code: the saw ring, his beam, its muzzle bloom and the wide beams.

Each function returns an RGBA array with hard edges, in the cast's blue and white ramps (tools/crisp.py RAMPS). The
game keeps the donor's script, so an effect image takes the exact size of the donor image it stands in for and its
shape is drawn to fill that canvas (the exporter keeps the donor's offsets and boxes).
"""
import numpy as np
from scipy import ndimage as ndi

WHITE = (248, 248, 248)
PALE = (200, 208, 224)
BLUE1 = (104, 200, 248)
BLUE2 = (24, 112, 216)
LINE = (16, 40, 104)


def _paint(h, w, tone):
    """tone: HxW int array, 0 = clear, 1..5 = LINE, BLUE2, BLUE1, PALE, WHITE (outside in)."""
    out = np.zeros((h, w, 4), np.uint8)
    for i, c in enumerate((LINE, BLUE2, BLUE1, PALE, WHITE), 1):
        out[tone == i] = (*c, 255)
    return out


def _wobble(n, amp, seed, sigma=4.0):
    """A smooth random profile in [-amp, amp] along n samples."""
    v = np.random.default_rng(seed).normal(size=n)
    v = ndi.gaussian_filter1d(v, sigma, mode="nearest")
    return amp * v / max(np.abs(v).max(), 1e-6)


def _bands(d, edge, core, mid, stripes=0):
    """Tone of a point at normalised distance d from the axis, for a beam whose outer edge is at `edge`."""
    tone = np.zeros(d.shape, np.int8)
    inside = d < edge
    tone[inside] = 2  # BLUE2
    tone[inside & (d >= edge - 1.6 / 80)] = 1  # outline
    tone[inside & (d < edge * mid)] = 3  # BLUE1
    tone[inside & (d < edge * (mid + core) / 2)] = 4  # PALE
    tone[inside & (d < edge * core)] = 5  # WHITE
    return tone


def beam(w, h, core=0.5, mid=0.75, seed=0, taper=60, stripes=0):
    """A horizontal beam from the left edge: bright core on the centre line, ragged edges, a rounded far end."""
    y, x = np.mgrid[0:h, 0:w]
    cy = (h - 1) / 2
    d = np.abs(y - cy) / (h / 2)
    edge = 0.94 + _wobble(w, 0.05, seed)[None, :]
    if taper:
        t = np.clip((x - (w - taper)) / taper, 0, 1)
        edge = edge * np.sqrt(np.clip(1 - t**2, 0, 1))
    edge = np.broadcast_to(edge, (h, w))
    tone = _bands(d, edge, core, mid)
    if stripes:  # thin pale stripes across the blue bands, like the donor's banded beam
        band = (tone == 3) & ((y // stripes) % 2 == 0)
        tone[band] = 4
    # rows 1 px thick lines at the very edge keep the outline when the profile is thin
    return _paint(h, w, tone)


def cone(w, h, seed=0):
    """A cone with its vertex at the left edge widening to the right: white core, blue flame edges."""
    y, x = np.mgrid[0:h, 0:w]
    cy = (h - 1) / 2
    half = (h / 2 - 2) * (0.03 + 0.97 * x / max(w - 1, 1))
    half = half * (1 + _wobble(w, 0.06, seed, 6.0)[None, :])
    d = np.abs(y - cy) / np.maximum(half, 1e-3)
    tone = _bands(np.where(half > 1, d, 9), 1.0, 0.45, 0.72)
    return _paint(h, w, tone)


def band(w, h, seed=0):
    """A band across the whole width: broad white core, blue flame fringes top and bottom."""
    y, x = np.mgrid[0:h, 0:w]
    cy = (h - 1) / 2
    d = np.abs(y - cy) / (h / 2)
    edge = 0.97 + _wobble(w, 0.03, seed, 5.0)[None, :]
    tone = _bands(d, np.broadcast_to(edge, (h, w)), 0.55, 0.8)
    return _paint(h, w, tone)


def muzzle(w, h, seed=0):
    """A bloom whose rounded edge sits on the left edge and whose rays run right: white core, blue halo."""
    y, x = np.mgrid[0:h, 0:w].astype(float)
    cx, cy = w * 0.42, (h - 1) / 2
    rx, ry = w * 0.42, h / 2 - 2
    th = np.arctan2((y - cy) / ry, (x - cx) / rx)
    rho = np.hypot((x - cx) / rx, (y - cy) / ry)
    # rays only on the right, fading to nothing round the left so the rounded edge stays clean
    rays = 0.55 * np.abs(np.sin(3.5 * th + seed)) ** 1.5 * np.clip(np.cos(th) + 0.1, 0, 1)
    d = rho / (1 + rays)
    tone = _bands(d, 1.0, 0.45, 0.75)
    return _paint(h, w, tone)


def ring(w, h, phase=0.0, teeth=10):
    """A toothed saw ring: a blue annulus with pale highlight and a dark outline, teeth turned by `phase` radians."""
    y, x = np.mgrid[0:h, 0:w].astype(float)
    cx, cy = (w - 1) / 2, (h - 1) / 2
    R = min(w, h) / 2 - 1.5
    r = np.hypot(x - cx, y - cy) / R
    th = np.arctan2(y - cy, x - cx)
    tooth = 0.18 * (np.sign(np.sin(teeth * th + phase)) > 0)
    outer = 0.80 + tooth
    inner = 0.42
    tone = np.zeros((h, w), np.int8)
    body = (r < outer) & (r > inner)
    tone[body] = 2
    tone[body & (r > outer - 0.1)] = 1
    tone[body & (r < inner + 0.1)] = 1
    tone[body & (r > inner + 0.1) & (r < outer - 0.1)] = 3
    hi = body & (th < -0.3) & (th > -2.3) & (r > inner + 0.1) & (r < outer - 0.1) & (r < 0.62)
    tone[hi] = 4
    return _paint(h, w, tone)
