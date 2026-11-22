"""Crisp SCWU-style pixel step for one high-resolution figure.

sprite(rgb, bg, height) -> RGBA sprite about `height` px tall:
  1. split thin dark lines from fills at full size and paint them over,
  2. snap every fill pixel to a hand-set material ramp, smooth with a majority filter,
  3. downscale by area-weighted vote (one class per output pixel, no blended colours),
  4. merge regions of 1 to 3 px into their neighbours (eye highlights and pupils kept),
  5. redraw lines 1 px: material edges in the darker material's line colour,
     fold lines inside one material become its shadow tone, and the silhouette
     gets a 1 px outline in the darker shade of the fill it closes.
specks(rgba) -> tiny colour regions (4 px or less) per 1000 figure px, the review's measure.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

# name: (tones light to dark, line colour). Channel values are multiples of 8 like the cast.
RAMPS = {
    "skin": ([(248, 216, 192), (232, 144, 128)], (168, 80, 64)),
    "hair": ([(80, 80, 88), (48, 48, 56)], (24, 24, 32)),
    "ink": ([(24, 24, 32)], (8, 8, 16)),
    "orange": ([(248, 152, 32), (216, 88, 8)], (120, 40, 8)),
    "white": ([(248, 248, 248), (200, 208, 224)], (104, 112, 136)),
    "silver": ([(232, 232, 240), (184, 184, 200), (136, 136, 152)], (64, 64, 88)),
    "grey": ([(144, 144, 152), (104, 104, 112)], (48, 48, 56)),
    "red": ([(232, 32, 40), (168, 16, 24)], (88, 8, 16)),
    "blue": ([(104, 200, 248), (24, 112, 216)], (16, 40, 104)),
    "yellow": ([(248, 248, 176), (240, 208, 88)], (144, 96, 24)),
    "navy": ([(64, 96, 184), (32, 48, 128)], (16, 24, 72)),
}
KEEP_SMALL = {"white", "ink", "yellow", "blue", "navy"}  # eye highlights, irises, pupils, lamp glints
SKIN_LINE = (168, 80, 64)


def lab(rgb):
    c = np.asarray(rgb, float) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]])
    xyz = xyz / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def palette(ramps=RAMPS):
    fills, mat, line, shade = [], [], [], []
    for mi, (tones, ln) in enumerate(ramps.values()):
        for ti, t in enumerate(tones):
            fills.append(t)
            mat.append(mi)
            line.append(ln)
            shade.append(ti == len(tones) - 1)
    return (np.array(fills, np.uint8), np.array(mat), np.array(line, np.uint8), np.array(shade), list(ramps))


def figure_mask(rgb, bg, thr=40, gap=18):
    diff = np.abs(rgb.astype(int) - np.asarray(bg, int)[None, None]).max(-1)
    m = diff > thr
    lab_, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab_, range(1, n + 1))
        m = np.isin(lab_, 1 + np.nonzero(sizes >= sizes.max() * 0.002)[0])
    # Enclosed holes whose colour is not the flat background (a dark blue lamp ring,
    # a shadowed visor) are part of the figure; real gaps (lantern handle, between arms) stay open.
    holes = ndi.binary_fill_holes(m) & ~m
    lab_, n = ndi.label(holes)
    if n:
        med = ndi.median(diff, lab_, range(1, n + 1))
        m |= np.isin(lab_, 1 + np.nonzero(np.asarray(med) >= gap)[0])
    return m


def thin_lines(rgb, mask, r, dark=72):
    lum = rgb.astype(int) @ np.array([299, 587, 114]) // 1000
    d = mask & (lum < dark)
    solid = ndi.binary_dilation(ndi.binary_erosion(d, iterations=r), iterations=r) & d
    return d & ~solid


def paint_over(rgb, known, todo):
    """Each `todo` pixel takes the colour of the nearest `known` pixel."""
    idx = ndi.distance_transform_edt(~known, return_distances=False, return_indices=True)
    out = rgb.copy()
    out[todo] = rgb[idx[0][todo], idx[1][todo]]
    return out


def majority(cls, valid, n, size=3):
    one = np.stack([ndi.uniform_filter(((cls == i) & valid).astype(np.float32), size) for i in range(n)])
    return np.where(valid, one.argmax(0), cls)


def merge_small(cls, ok, mat, names, n, max_px=3, rounds=3):
    keep = np.array([names[m] in KEEP_SMALL for m in mat])
    for _ in range(rounds):
        changed = False
        for i in range(n):
            if keep[i]:
                continue
            lab_, k = ndi.label(ok & (cls == i))
            if not k:
                continue
            sizes = ndi.sum(np.ones_like(cls), lab_, range(1, k + 1))
            for j in np.nonzero(sizes <= max_px)[0]:
                reg = lab_ == j + 1
                ring = ndi.binary_dilation(reg, np.ones((3, 3))) & ~reg & ok
                if not ring.any():
                    continue
                vals = np.bincount(cls[ring], minlength=n)
                vals[i] = 0
                if vals.max():
                    cls[reg] = vals.argmax()
                    changed = True
        if not changed:
            break
    return cls


def zhang_suen(m):
    m = np.pad(m.copy(), 1)
    while True:
        changed = False
        for step in (0, 1):
            P = [np.roll(np.roll(m, -dy, 0), -dx, 1) for dy, dx in
                 ((-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1))]
            B = sum(p.astype(int) for p in P)
            A = sum(((~P[i]) & P[(i + 1) % 8]).astype(int) for i in range(8))
            c = (~(P[0] & P[2] & P[4]) & ~(P[2] & P[4] & P[6])) if step == 0 else \
                (~(P[0] & P[2] & P[6]) & ~(P[0] & P[4] & P[6]))
            rm = m & (B >= 2) & (B <= 6) & (A == 1) & c
            if rm.any():
                m &= ~rm
                changed = True
        if not changed:
            return m[1:-1, 1:-1]


def sprite(rgb, bg, height=None, ramps=RAMPS, line_thr=0.34, src_h=None, scale=None, keep=None,
           folds="shadow", corners=False, face=True):
    """rgb: HxWx3 crop holding one figure on a flat background.
    Returns (RGBA uint8, scale, (x0, y0)) where (x0, y0) is the crop corner in `rgb` coordinates.
    keep: optional bool mask (same size as rgb) of figure pixels to keep; default the largest blobs."""
    fills, mat, line_col, shade, names = palette(ramps)
    n = len(fills)
    mask = figure_mask(rgb, bg)
    if keep is not None:
        mask &= keep
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, mask = rgb[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    scale = scale or height / float(src_h or (y1 - y0))
    r = max(2, int(np.ceil(0.75 / scale)))
    lines = thin_lines(rgb, mask, r)
    clean = paint_over(rgb, mask & ~lines, mask & lines)
    d = ((lab(clean)[..., None, :] - lab(fills)[None, None]) ** 2).sum(-1)
    cls = d.argmin(-1)
    cls = majority(cls, mask, n, size=max(3, int(round(0.5 / scale)) | 1))
    H, W = max(1, round((y1 - y0) * scale)), max(1, round((x1 - x0) * scale))

    def down(a):
        return np.asarray(Image.fromarray(a.astype(np.float32)).resize((W, H), Image.BOX))
    cov = down(mask)
    votes = np.stack([down((cls == i) & mask) for i in range(n)])
    alpha = cov > 0.5
    lcov = down(lines)
    small = votes.argmax(0)
    ok = alpha.copy()
    small = merge_small(small, ok, mat, names, n)
    # Lines: thinned to 1 px.
    ln = zhang_suen((lcov > line_thr) & alpha)
    pa = np.pad(alpha, 1)
    edge = alpha & ~(pa[:-2, 1:-1] & pa[2:, 1:-1] & pa[1:-1, :-2] & pa[1:-1, 2:])
    # The silhouette outline replaces the drawn outer line, so drop line pixels just inside it.
    near_edge = ndi.binary_dilation(edge, np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])) & ~edge
    ln &= ~near_edge
    ln &= ~edge
    if corners:
        ln = clean_corners(ln)
    lum = fills.astype(float) @ np.array([0.299, 0.587, 0.114])
    rgbo = fills[small].copy()
    # Neighbour fills of each line pixel (8-neighbourhood, non-line, inside).
    pad_c = np.pad(small, 1)
    pad_ok = np.pad(alpha & ~ln, 1)
    neigh = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy or dx:
                okn = pad_ok[1 + dy:pad_ok.shape[0] - 1 + dy, 1 + dx:pad_ok.shape[1] - 1 + dx]
                cn = pad_c[1 + dy:pad_c.shape[0] - 1 + dy, 1 + dx:pad_c.shape[1] - 1 + dx]
                neigh.append(np.where(okn, cn, -1))
    neigh = np.stack(neigh)
    for y, x in zip(*np.nonzero(ln)):
        nb = neigh[:, y, x]
        nb = nb[nb >= 0]
        if not len(nb):
            continue
        mats = set(mat[nb])
        if len(mats) == 1 and folds == "shadow":
            # A fold inside one material: its shadow tone, like the cast's cel shapes.
            m0 = mat[nb[0]]
            rgbo[y, x] = fills[np.nonzero((mat == m0) & shade)[0][0]]
        else:
            darkest = nb[np.argmin(lum[nb])]
            rgbo[y, x] = line_col[darkest]
    # Silhouette: darker shade of the fill it closes.
    rgbo[edge] = line_col[small[edge]]
    if face:
        face_details(rgbo, alpha & ~edge, rgb, mask, cls, mat, fills, names, down)
    out = np.dstack([rgbo, (alpha * 255).astype(np.uint8)])
    return out, scale, (int(x0), int(y0))


def face_details(rgbo, inside, rgb, mask, cls, mat, fills, names, down):
    """Keep the face readable at sprite size, like the cast's hand-placed faces.

    The vote downscale drops anything under half a pixel, so a thin mouth, nose mark or brow
    and the iris and highlight of an eye vanish. Inside the face (skin and what it encloses,
    upper half of the figure only) these marks win their pixel at a lower coverage:
    brownish marks become the skin line colour, irises and highlights keep their own colour."""
    skin_i = names.index("skin")
    skin = mask & (mat[cls] == skin_i)
    H = mask.shape[0]
    ys = np.nonzero(skin.any(1))[0]
    if not len(ys):
        return
    skin[int(H * 0.5):] = False
    zone = ndi.binary_fill_holes(skin)
    zone = ndi.binary_dilation(zone, iterations=max(2, H // 300))
    lum = rgb.astype(int) @ np.array([299, 587, 114]) // 1000
    r, g = rgb[..., 0].astype(int), rgb[..., 1].astype(int)
    # Marks drawn on the skin: mouth, nose, brow, cheek lines (darker than the skin shadow, warm).
    marks = zone & mask & (lum < 150) & (lum > 60) & (r - g > 25)
    marks &= ndi.binary_dilation(skin, iterations=3)  # touching skin, not the hair edge
    cov = down(marks)
    rgbo[inside & (cov >= 0.2)] = SKIN_LINE
    # Eyes: iris and highlight.
    for name, thr in (("navy", 0.28), ("white", 0.3)):
        if name not in names:
            continue
        mi = names.index(name)
        part = zone & mask & (mat[cls] == mi)
        lab_, k = ndi.label(part)
        if not k:
            continue
        sizes = ndi.sum(part, lab_, range(1, k + 1))
        small = np.isin(lab_, 1 + np.nonzero(sizes < H * H * 0.002)[0])
        cv = down(small)
        tone = fills[np.nonzero(mat == mi)[0][0 if name == "white" else -1]]
        rgbo[inside & (cv >= thr)] = tone


def clean_corners(ln):
    """Pixel-perfect lines: drop the corner pixel of an L step (it doubles the line's weight)."""
    ln = ln.copy()
    H, W = ln.shape
    for _ in range(2):
        p = np.pad(ln, 1)
        N, S, Wn, E = p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]
        NW, NE, SW, SE = p[:-2, :-2], p[:-2, 2:], p[2:, :-2], p[2:, 2:]
        n4 = N.astype(int) + S + Wn + E
        n8 = n4 + NW + NE + SW + SE
        L = ((N & E & ~NE) | (E & S & ~SE) | (S & Wn & ~SW) | (Wn & N & ~NW))
        rm = ln & (n4 == 2) & (n8 == 2) & L
        if not rm.any():
            break
        # remove one of each touching pair only: process in a checkerboard order
        yy, xx = np.mgrid[0:H, 0:W]
        for parity in (0, 1):
            p = np.pad(ln, 1)
            N, S, Wn, E = p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]
            NW, NE, SW, SE = p[:-2, :-2], p[:-2, 2:], p[2:, :-2], p[2:, 2:]
            n4 = N.astype(int) + S + Wn + E
            n8 = n4 + NW + NE + SW + SE
            L = ((N & E & ~NE) | (E & S & ~SE) | (S & Wn & ~SW) | (Wn & N & ~NW))
            ln &= ~(ln & (n4 == 2) & (n8 == 2) & L & (((yy + xx) % 2) == parity))
    return ln


def specks(rgba, max_px=4):
    a = rgba[..., 3] > 0
    key = (rgba[..., 0].astype(np.int64) << 16) | (rgba[..., 1].astype(np.int64) << 8) | rgba[..., 2]
    count = 0
    for v in np.unique(key[a]):
        lab_, k = ndi.label(a & (key == v))
        if k:
            sizes = np.bincount(lab_.ravel())[1:]
            count += int((sizes <= max_px).sum())
    return 1000.0 * count / a.sum()
