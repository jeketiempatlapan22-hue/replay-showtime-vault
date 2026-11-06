import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LiveChat from './LiveChat';

const mocks = vi.hoisted(() => ({ admin: false, moderator: false, rpc: vi.fn(), invoke: vi.fn(), toast: vi.fn(), rows: [] as unknown[] }));
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/lib/browserId', () => ({ getBrowserId: () => 'browser-test' }));
vi.mock('@/integrations/backend', () => {
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-test' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const key of ['select', 'eq', 'is', 'order', 'limit']) q[key] = () => q;
      q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'live_messages' ? mocks.rows : [] }).then(resolve);
      q.maybeSingle = async () => ({ data: null });
      return q;
    },
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: vi.fn(),
  };
  return { supabase: client };
});

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('replaytime-name', 'Penonton');
  mocks.admin = false; mocks.moderator = false; mocks.rows = [];
  mocks.rpc.mockReset(); mocks.invoke.mockReset(); mocks.toast.mockReset();
  mocks.rpc.mockImplementation(async (fn, args) => ({ data: fn === 'has_role' ? (args._role === 'admin' ? mocks.admin : mocks.moderator) : null, error: null }));
});
afterEach(cleanup);

describe('LiveChat server flow', () => {
  it('sends guest chat via the function and shows the returned message immediately', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, message: { id: 'sent1', name: 'Penonton', message: 'Halo live', pinned: false, is_admin: false, created_at: new Date().toISOString() } }, error: null });
    render(<LiveChat />);
    fireEvent.change(screen.getByPlaceholderText('Ketik pesan...'), { target: { value: 'Halo live' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Ketik pesan...'), { key: 'Enter' });
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('live-chat-send', expect.objectContaining({ body: expect.objectContaining({ message: 'Halo live', browser_id: 'browser-test', reply_to_id: null, show_id: null }) })));
    expect(await screen.findByText('Halo live')).toBeInTheDocument();
  });
  it('shows the server block error without accepting the message', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: false, error: 'Kamu diblokir dari live chat.' }, error: null });
    render(<LiveChat />);
    fireEvent.change(screen.getByPlaceholderText('Ketik pesan...'), { target: { value: 'Pesan ditolak' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Ketik pesan...'), { key: 'Enter' });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Kamu diblokir dari live chat.' })));
    expect(screen.queryByText('Pesan ditolak')).not.toBeInTheDocument();
  });
  it('lets moderators inspect and delete but does not expose phone or promotion controls', async () => {
    mocks.moderator = true;
    mocks.rows = [{ id: 'msg1', name: 'Pengirim', message: 'Halo', browser_id: 'sender-browser', created_at: new Date().toISOString(), pinned: false, is_admin: false }];
    mocks.rpc.mockImplementation(async (fn, args) => ({ data: fn === 'has_role' ? args._role === 'moderator' : fn === 'admin_get_chat_sender' ? { name: 'Pengirim', sender_role: 'user', user_id: 'sender-user', phone: '08123456789', token_tail: 'ABCDEF', token_kind: 'membership', created_by: 'admin', browser_id: 'sender-browser', is_blocked: false, is_moderator: false } : true, error: null }));
    render(<LiveChat />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pengirim' }));
    await screen.findByText('Membership');
    expect(screen.queryByText('08123456789')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jadikan Moderator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin pesan' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Hapus Pesan' })[0]);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('mod_delete_message', { _message_id: 'msg1' }));
  });
  it('lets admins inspect phone and promote a signed-in sender', async () => {
    mocks.rows = [{ id: 'msg2', name: 'User Member', message: 'Halo', browser_id: 'sender-browser', created_at: new Date().toISOString(), pinned: false, is_admin: false }];
    mocks.rpc.mockImplementation(async (fn, args) => ({ data: fn === 'has_role' ? args._role === 'admin' : fn === 'admin_get_chat_sender' ? { name: 'User Member', sender_role: 'user', user_id: 'sender-user', phone: '08123456789', token_tail: 'ABCDEF', token_kind: 'membership', created_by: 'reseller:Toko', browser_id: 'sender-browser', is_blocked: false, is_moderator: false } : true, error: null }));
    render(<LiveChat />);
    fireEvent.click(await screen.findByRole('button', { name: 'User Member' }));
    expect(await screen.findByText('08123456789')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jadikan Moderator' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('admin_set_moderator', { _user_id: 'sender-user', _on: true }));
  });
});