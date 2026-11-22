"""Batch 3 poses (specials): key -> (donor, donor image, form, guide|free, canvas size, pose text).

Donors: RYUKO (assets) Spinning Axe 226 for RING, DoraEmon 278 for SHUWATCH, ALEX REFLACT 261 for BARRIER,
ZOMA's reload 229 for RECHARGE (free poses: ZOMA sits in a tank there). SHUWATCH's poses are free too since the
22 Nov review: drawn on DoraEmon's guides they came out off-size. SWING reuses batch 2's Chuck drawings on
RYUKO's Daisetsuzan (214, 215). SPECIUM is round 7's.
"""
from b2_poses import BASE_ID, FREE, GUIDE, HERO_ID, TAIL

L, P = "1536x1024", "1024x1536"
POSES = {
    "r-320": ("ryuko", 320, "hero", "guide", P, "fighting stance, knees bent, leading fist forward, the other hand starting to rise beside his head"),
    "r-321": ("ryuko", 321, "hero", "guide", P, "winding up: the throwing hand pulled back behind his shoulder at head height, palm open and flat, the other arm forward"),
    "r-322": ("ryuko", 322, "hero", "guide", P, "about to throw: the throwing hand raised high behind his head, palm open and flat as if holding up a thin spinning disc, body twisted back"),
    "r-325": ("ryuko", 325, "hero", "guide", P, "throw follow-through: low lunge forward, the throwing arm flung straight forward and down at waist height, palm open, the other arm back"),
    "sw-293": ("dora", 293, "hero", "free", P, "bracing before take-off: knees bent, weight on the back leg, both fists raised in front of his chest, looking up"),
    "sw-321": ("dora", 321, "hero", "free", P, "springing up: one knee raised high, one fist punching straight up above his head, the other fist at his chest"),
    "sw-328": ("dora", 328, "hero", "free", P, "flying upward like a rocket: body stretched out diagonally up and forward, both arms straight out ahead of his head with fists clenched, legs together trailing behind"),
    "sw-125": ("dora", 125, "hero", "free", P, "dropping down after the flight: standing upright in the air, both fists raised above his shoulders, legs straight and together"),
    "b-235": ("alex", 235, "hero", "guide", P, "gathering power: knees bent, both forearms crossed in front of his chest, fists clenched"),
    "b-236": ("alex", 236, "hero", "guide", P, "pushing out a wall of light: front leg forward, both arms thrust straight forward at chest height, palms open and facing out"),
    "rc-117": ("zoma", 117, "hero", "free", P, "bracing to recharge: standing firm with feet apart, both fists clenched down at his sides, chest pushed out"),
    "rc-261": ("zoma", 261, "hero", "free", P, "raising his arms: elbows bent, both fists at shoulder height, chest pushed forward, looking up"),
    "rc-262": ("zoma", 262, "hero", "free", P, "both arms raised straight up overhead in a wide V, fists clenched, head tilted back, chest lamp pushed forward"),
    "rc-263": ("zoma", 263, "hero", "free", P, "both arms raised straight up overhead with the fists touching above his head, standing tall on his toes"),
}


def prompt(key):
    _, n, form, how, size, pose = POSES[key]
    return "\n".join([BASE_ID if form == "base" else HERO_ID, GUIDE if how == "guide" else FREE, TAIL, f"POSE: {pose}."])
