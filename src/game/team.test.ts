import { describe, expect, it } from 'vitest';
import { LIFE, Match } from './match';

// A third player borrowed from another match: a story battle seats up to
// eight.
function trio() {
  const match = new Match();
  match.fighters.push(new Match().fighters[1]);
  match.cpus.push(null);
  match.clearInput();
  return match;
}

describe('more than two players', () => {
  it('targets and faces the nearest player it fights (0x40e5c0)', () => {
    const match = trio();
    const [f, a, b] = match.fighters;
    [f.x, a.x, b.x] = [600, 900, 450];
    match.step();
    expect(f.target).toBe(b);
    expect(f).toMatchObject({ action: 'turn', facing: -1 });
    // One it doesn't fight (+0xdfb7) or that is KO'd is passed over.
    f.enemies = ~(1 << 2);
    match.step();
    expect(f.target).toBe(a);
    f.enemies = -1;
    b.hp = 0;
    match.step();
    expect(f.target).toBe(a);
    a.hp = 0;
    match.step();
    expect(f.target).toBeNull();
  });

  it('strikes every player it fights that its box reaches, and no ally', () => {
    for (const ally of [false, true]) {
      const match = trio();
      const [f, a, b] = match.fighters;
      [a.x, b.x] = [f.x + 120, f.x + 120];
      if (ally) f.enemies = ~(1 << 2);
      match.step({ punch: true });
      while (f.action === 'script' && a.hp === LIFE) match.step();
      expect(a.hp).toBeLessThan(LIFE);
      expect(b.hp < LIFE).toBe(!ally);
    }
  });

  it("stops every other player, not just the striker, with a reaction's other stop", () => {
    const match = trio();
    const [f, a, b] = match.fighters;
    [a.x, b.x] = [f.x + 120, 1400];
    match.step({ punch: true });
    while (a.hp === LIFE) match.step();
    match.step();
    // Op 0x1a's r[2] (0x4136ae) reaches the striker and the bystander alike;
    // the bystander, stepping after the victim, counts it down at once.
    expect(a.hitStop).toBeGreaterThan(0);
    expect(f.hitStop).toBeGreaterThan(1);
    expect(b.hitStop).toBe(f.hitStop - 1);
  });
});
