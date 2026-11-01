import { describe, expect, it } from 'vitest';
import { opponentChoiceOf, resetModeOf } from './menu';

describe('opponent select', () => {
  it('maps the match mode and partner to its value', () => {
    expect(opponentChoiceOf('practice', 'guard')).toBe('guard');
    expect(opponentChoiceOf('cpu', 'stand')).toBe('vsCpu');
    expect(opponentChoiceOf('story', 'stand')).toBe('story');
  });

  it('resets to the picked mode, live partner changes aside', () => {
    expect(resetModeOf('vsCpu', 'practice')).toBe('cpu');
    expect(resetModeOf('vsCpu', 'story')).toBe('cpu');
    expect(resetModeOf('guard', 'cpu')).toBe('practice');
    expect(resetModeOf('guard', 'story')).toBe('practice');
    expect(resetModeOf('guard', 'practice')).toBeNull();
    expect(resetModeOf('story', 'practice')).toBeNull();
  });
});
