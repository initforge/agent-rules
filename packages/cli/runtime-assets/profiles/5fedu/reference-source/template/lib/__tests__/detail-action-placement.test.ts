import { describe, it, expect } from 'vitest';
import { partitionDetailActions, type DetailChromeActionBase } from '@/lib/detail-action-placement';

describe('partitionDetailActions', () => {
  it('splits prominent and groups inline by fieldKey', () => {
    type A = DetailChromeActionBase & { extra?: string };
    const actions: A[] = [
      { id: 'a', placement: 'prominent', label: 'A' },
      { id: 'b', placement: 'inline', fieldKey: 'email', label: 'B' },
      { id: 'c', placement: 'inline', fieldKey: 'email', label: 'C' },
      { id: 'd', placement: 'inline', fieldKey: undefined, label: 'D' },
    ];
    const { prominent, inlineByFieldKey } = partitionDetailActions(actions);
    expect(prominent).toHaveLength(1);
    expect(prominent[0].id).toBe('a');
    expect(inlineByFieldKey.email).toHaveLength(2);
    expect(inlineByFieldKey._).toHaveLength(1);
    expect(inlineByFieldKey._[0].id).toBe('d');
  });
});
