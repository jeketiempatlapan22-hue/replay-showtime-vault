import { describe, it, expect, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { upsertActiveShow } from './activeShows';

describe('special-show member persistence', () => {
  it('includes the admin-entered birthday member in the save request', async () => {
    await upsertActiveShow({ category: 'sts', featured_member: 'Freya' });
    expect(invoke).toHaveBeenLastCalledWith('manage-live', { body: { action: 'upsert_active_show', show: { category: 'sts', featured_member: 'Freya' } } });
  });
  it('includes the admin-entered graduating member in the save request', async () => {
    await upsertActiveShow({ category: 'last_show', featured_member: 'Gracia' });
    expect(invoke).toHaveBeenLastCalledWith('manage-live', { body: { action: 'upsert_active_show', show: { category: 'last_show', featured_member: 'Gracia' } } });
  });
});