// Authored (HPA-767): source life values written in native HP units read as
// shares of the fighter's effective maximum. A threshold keeps the source's
// exact 1-HP sentinel and floors a scaled mark at 1; an amount (a heal, drain
// or carryover) is a whole-HP share floored at 1, so a 1-point pass still
// moves one point. With Cheats off both are the identity.
export const lifeMarkOf = (mark: number, maxHp: number, native: number) =>
  mark <= 0 || mark === 1
    ? mark
    : Math.max(1, Math.trunc((mark * maxHp) / native));

export const lifeShareOf = (amount: number, maxHp: number, native: number) =>
  Math.trunc((amount * maxHp) / native);

export const lifeAmountOf = (amount: number, maxHp: number, native: number) =>
  Math.max(1, lifeShareOf(amount, maxHp, native));
