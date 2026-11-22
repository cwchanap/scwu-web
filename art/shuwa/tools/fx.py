"""Effect objects drawn like the cast's: soft light, separate from the fighter frames.

The cast's effect sprites sit on black and are drawn additively, so they read as soft glows.
Here each effect is an RGBA layer whose alpha falls off smoothly, banded into a few steps so
it still sits with pixel art. Over the stage it looks close to an additive glow.
"""
import numpy as np

WHITE = np.array([255, 255, 255], float)
PALE = np.array([200, 236, 255], float)
BLUE = np.array([96, 180, 255], float)
WARM = np.array([255, 244, 176], float)
AMBER = np.array([255, 200, 88], float)


def _band(v, steps=6):
    return np.round(np.clip(v, 0, 1) * steps + 0.3) / steps * (v > 0.04)


def _rgba(intensity, inner, outer, steps=6):
    """intensity 0..1 -> colour from outer (dim) to inner (bright), alpha from intensity."""
    i = _band(intensity, steps)
    t = np.clip((i - 0.35) / 0.65, 0, 1)[..., None]
    col = outer * (1 - t) + inner * t
    col = np.where((i > 0.85)[..., None], WHITE, col)
    a = np.clip(i * 1.15, 0, 1) * 255
    return np.dstack([col, a]).astype(np.uint8)


def glow(r, inner=WARM, outer=AMBER, power=1.6, rays=0, ray_len=1.6, steps=6, seed=0):
    """Round soft glow of radius r (px). Optional thin rays for a flare."""
    n = int(np.ceil(r * (ray_len if rays else 1))) + 2
    y, x = np.mgrid[-n:n + 1, -n:n + 1].astype(float)
    d = np.hypot(x, y) / r
    v = np.clip(1 - d, 0, 1) ** power
    if rays:
        ang = np.arctan2(y, x)
        rng = np.random.default_rng(seed)
        off = rng.uniform(0, np.pi)
        ray = np.clip(np.cos(rays * (ang + off)), 0, 1) ** 24
        v = np.maximum(v, ray * np.clip(1 - np.hypot(x, y) / (r * ray_len), 0, 1) ** 1.2 * 0.9)
    return _rgba(v, inner, outer, steps)


def beam(length, thick=60, phase=0, ripple=0.08, tip=0.18, steps=6):
    """Horizontal beam, origin at the left edge's vertical centre. Returns (rgba, origin_y)."""
    h = thick + 8
    y, x = np.mgrid[0:h, 0:length].astype(float)
    cy = (h - 1) / 2
    wob = 1 + ripple * np.sin(x / 9.0 + phase * 1.7) + 0.5 * ripple * np.sin(x / 3.7 - phase * 2.3)
    half = thick / 2 * wob
    # Rounded, slightly narrower tip.
    t = np.clip((length - x) / max(1.0, length * tip), 0, 1)
    half = half * (0.55 + 0.45 * np.sqrt(t))
    d = np.abs(y - cy) / np.maximum(half, 1)
    v = np.clip(1 - d, 0, 1) ** 0.9
    v = np.where(x > length - 2, 0, v)
    rgba = _rgba(v, PALE, BLUE, steps)
    return rgba, int(round(cy))


def flash(mask_rgba, strength=1.0):
    """A white silhouette of a fighter frame (the transform cut)."""
    a = mask_rgba[..., 3] > 0
    out = np.zeros_like(mask_rgba)
    out[a] = (248, 248, 248, int(255 * strength))
    return out
