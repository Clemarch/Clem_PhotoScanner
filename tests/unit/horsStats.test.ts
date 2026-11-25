import { describe, expect, it } from 'vitest';
import type { PoseValidation } from '../../src/engine';
import { eclairLine } from '../../src/ui/report';

const val = (sessionId: string, n: number, right: boolean): PoseValidation => ({
  id: `${sessionId}|${n}`,
  at: n,
  sessionId,
  packKey: `p${n}`,
  margin: 0.05,
  keys: [`a${n}`, `b${n}`],
  proposed: [`a${n}`],
  kept: right ? [`a${n}`] : [`a${n}`, `b${n}`],
  ms: 3000,
});

describe('séance hors statistiques (photos déjà triées avant, 25/11)', () => {
  const vs = [val('s1', 1, true), val('s1', 2, true), val('s2', 3, false), val('s2', 4, false)];
  it('sans exclusion : toutes les séances comptent', () => {
    expect(eclairLine(vs, 's2')).toContain('depuis le début 2/4 (50 %) poses');
  });
  it('séance exclue : retirée du total, toujours mesurée seule', () => {
    const line = eclairLine(vs, 's2', new Set(['s2']));
    expect(line).toContain('cette séance 0/2 (0 %) poses');
    expect(line).toContain('(séance hors statistiques)');
    expect(line).toContain('depuis le début 2/2 (100 %) poses');
    expect(line).toContain('(1 séance hors statistiques)');
  });
});
