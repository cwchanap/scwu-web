"""Batch 2 (normals) pose table: key -> (RYUKO image, form, guide or free, canvas, pose text)."""
L, P = "1536x1024", "1024x1536"
POSES = {
    "p1-32": (32, "base", "guide", P, "punch wind-up: stepping forward, his free hand pulled back by his shoulder as a flat karate-chop hand, ready to strike; the lantern hand held low by his hip"),
    "p1-33": (33, "base", "guide", P, "quick karate chop: leaning into it, his free arm thrust straight forward at head height with a flat knife-hand, the lantern hand pulled back by his hip, front knee bent"),
    "p1-34": (34, "base", "guide", P, "recovering from the chop: back on both feet in a short stance, the chopping hand pulled halfway back toward his chest, elbow bent, hand still flat; the lantern stays low in front of his belly"),
    "p3-10": (10, "base", "guide", P, "big wind-up: stepping in low, body coiled, free hand drawn far back, about to strike hard"),
    "p3-36": (36, "hero", "guide", P, "rapid chops: legs in a wide low stance, his front arm thrust straight forward at chest height with a flat knife-hand, the rear arm pulled back to his ribs"),
    "p3-35": (35, "hero", "guide", P, "chop coming out: legs in a wide low stance, body hunched forward, his front arm halfway out in front of his chest with a flat knife-hand, elbow still bent, the rear fist at his ribs"),
    "p3-39": (39, "hero", "guide", P, "finishing pose: standing tall, forearms crossed in front of his chest in an X, hands in fists"),
    "p4-38": (38, "hero", "guide", P, "spinning kick wind-up: turning away from the viewer mid-spin, shoulders twisted, front knee raised high, arms tucked in"),
    "p4-41": (41, "hero", "guide", L, "spinning heel kick: body leaning back, one leg swung forward and fully straight at head height, the other leg planted, arms flung out for balance"),
    "p4-42": (42, "hero", "guide", P, "somersault: upside down in the air mid-flip, legs up and bent, arms reaching down, head near the bottom"),
    "ap-55": (55, "hero", "guide", P, "jumping overhead chop wind-up: in the air with knees tucked up, both hands raised together high behind his head"),
    "ap-54": (54, "hero", "guide", P, "jumping chop starting: in the air with knees tucked up, both arms swinging up from his sides, hands at shoulder height"),
    "ap-56": (56, "hero", "guide", P, "jumping overhead chop: in the air with knees tucked up, both arms swung down and forward together, flat knife-hands striking low in front of him"),
    "cp-90": (90, "base", "guide", P, "crouching jab: crouched low on bent knees, his free hand jabbing straight forward at waist height, the lantern held close to his body"),
    "cp-92": (92, "hero", "guide", L, "crouching straight punch: crouched low on bent knees, his front arm punching straight forward at chest height with a fist, the rear fist at his hip"),
    "cp-93": (93, "hero", "guide", P, "crouching, recovering: crouched low on bent knees, arms pulled back in front of his chest, fists up"),
    "k1-71": (71, "base", "guide", P, "kick wind-up: standing on one leg, front knee raised high, arms up in a loose guard, the lantern still in his hand"),
    "k1-72": (72, "base", "guide", P, "front kick: standing on one leg, the front leg kicked straight forward at waist height with the sole of the boot forward, body leaning back slightly, arms back for balance"),
    "k3-75": (75, "hero", "guide", P, "high kick wind-up: standing on one leg, the kicking knee pulled up high to his chest, arms in a guard"),
    "k3-76": (76, "hero", "guide", P, "high side kick: standing on one leg, the other leg kicked straight forward at head height, body leaning back, arms back for balance"),
    "k3-78": (78, "hero", "guide", P, "after the kick: landing back in a wide fighting stance, arms in a guard"),
    "k4-79": (79, "hero", "guide", P, "kick flurry wind-up: body turned slightly away, arms drawn back, weight on the back leg"),
    "k4-82": (82, "hero", "free", P, "rapid kicks: standing on one leg, the other leg kicking straight forward at chest height, arms held out for balance"),
    "k4-83": (83, "hero", "free", P, "rapid kicks, second beat: standing on one leg, the other leg kicking straight forward at waist height, a little lower than a chest-high kick, arms held out for balance"),
    "ak-86": (86, "hero", "free", P, "jump kick wind-up: in the air with both knees tucked up to his chest, arms in a guard, feet off the ground"),
    "ak-87": (87, "hero", "free", P, "flying kick: in the air diving forward and down at a 45 degree angle, the front leg kicked straight down and forward, the back leg tucked, arms swept back, feet off the ground"),
    "ck-95": (95, "hero", "free", L, "low sweep wind-up: crouched very low on one knee, one hand on the ground, the other leg pulled in"),
    "ck-98": (98, "hero", "free", L, "low sweep kick: crouched very low with one hand on the ground, the other leg kicked out straight forward along the ground"),
    "ch-103": (103, "hero", "free", P, "grab: leaning forward with bent knees, both arms reaching straight forward at chest height with open hands to grab someone"),
    "ch-105": (105, "hero", "free", P, "holding: both hands clamped shut in front of his chest as if gripping someone's collar, pulling them close, knees bent. Draw only SHUWA"),
    "ch-104": (104, "hero", "free", P, "grab closing: leaning forward with bent knees, both arms forward at chest height, elbows bending as the half-closed hands pull in toward his chest. Draw only SHUWA"),
    "ct-107": (107, "hero", "free", P, "lifting throw, side view: both arms raised straight above his head as if holding someone up overhead, knees bent, leaning back. Draw only SHUWA, not the person he holds"),
    "ct-108": (108, "hero", "free", P, "spinning with arms raised, seen from behind: his back to the viewer, both arms raised straight above his head as if holding someone up overhead. Draw only SHUWA"),
    "ct-110": (110, "hero", "free", P, "spinning with arms raised, seen from the front: facing the viewer, both arms raised straight above his head as if holding someone up overhead. Draw only SHUWA"),
    "ct-111": (111, "hero", "free", P, "throw follow-through: one arm flung forward and up after hurling someone away, body leaning forward, the other arm back. Draw only SHUWA"),
    "hu-113": (113, "base", "guide", P, "rising wind-up: springing up out of a crouch, his free arm swinging upward"),
    "hu-115": (115, "hero", "free", P, "rising chop: leaping up, his front arm swinging upward with a flat knife-hand, body rising, toes leaving the ground"),
    "hu-114": (114, "hero", "free", P, "rising: standing tall on his toes, knees slightly bent, about to leap, his front arm swinging forward and up to shoulder height with a flat knife-hand, the other arm back"),
    "hu-116": (116, "hero", "free", P, "rising chop at the top: stretched upward, his front arm straight up above his head with a flat knife-hand, toes pushing off the ground"),
    "hu-117": (117, "hero", "free", P, "rising chop nearly at the top: his chopping arm raised high above his head, tilted a little forward of straight up, flat knife-hand, body stretched and leaning slightly forward, one knee lifting, toes of the other foot on the ground"),
}

BASE_ID = ("Image 1 is SHUWA, a fighter in the 2D fighting game SCWU. Keep his exact design: the same face, hair, silver hard hat "
           "with the tall fin, orange coveralls with white reflective stripes, dark harness straps holding the round blue chest lamp in "
           "the centre of his chest, grey gloves and boots, and the lantern in one hand; the same proportions (chibi, about 2.6 heads "
           "tall), colours, clean dark coloured outlines and flat two-tone cel shading.")
HERO_ID = ("Image 1 is SHUWA in his powered hero form, a fighter in the 2D fighting game SCWU: a chibi silver hero with red stripes, "
           "big yellow eyes, a fin on his head and a blue chest lamp in the centre of his chest. Keep his exact design, proportions, "
           "colours, clean dark coloured outlines and flat two-tone cel shading. He fights bare-handed.")
GUIDE = ("Image 2 is ONLY a pose and size guide: a pixel sprite of a different fighter. Do not copy that fighter's face, hair, cape, "
         "clothes, colours or pixel style, and ignore any drill, hammer, gun or machine part it has. Draw SHUWA in the same pose as "
         "image 2, at the same size and in the same place on the canvas, facing RIGHT, full body, on a plain flat blue background "
         "(#28589C) like image 1.")
FREE = ("Draw SHUWA in the pose below at the same size as in image 1 (same head size), in the same place on the canvas, facing RIGHT, "
        "full body, on a plain flat blue background (#28589C) like image 1.")
TAIL = "A flat cel illustration, not pixel art. No text, labels, ground shadow, motion lines or effects."


def prompt(key):
    n, form, how, size, pose = POSES[key]
    return "\n".join([BASE_ID if form == "base" else HERO_ID, GUIDE if how == "guide" else FREE, TAIL, f"POSE: {pose}."])
