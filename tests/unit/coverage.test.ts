import { describe, expect, it } from 'vitest';
import { uncovered } from '../../src/engine';

const H = 3600 * 1000;
describe('prochain tri sans albums (point 70)', () => {
  it('périodes non couvertes, la plus récente d’abord ; petits trous ignorés', () => {
    const gaps = uncovered(
      [
        { start: 10 * H, end: 12 * H },
        { start: 12 * H + 60_000, end: 14 * H }, // 1 min après : même période
        { start: 20 * H, end: 22 * H },
      ],
      30 * H,
    );
    expect(gaps).toEqual([
      { start: 22 * H, end: 30 * H },
      { start: 14 * H, end: 20 * H },
      { start: -Infinity, end: 10 * H },
    ]);
  });
  it('sans séance : tout reste à trier ; à jour : seulement les plus anciennes', () => {
    expect(uncovered([], 5 * H)).toEqual([{ start: -Infinity, end: 5 * H }]);
    expect(uncovered([{ start: H, end: 5 * H }], 5 * H + 60_000)).toEqual([{ start: -Infinity, end: H }]);
  });
});
