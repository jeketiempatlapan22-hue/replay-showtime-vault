import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/backend';
import type { Database } from '@/integrations/supabase/types';
import { readMembershipCredentials, type MembershipCredentials } from '@/lib/membershipAccess';

export type ChatRole = 'admin' | 'moderator' | 'user';
export interface ChatSender {
  name: string;
  sender_role: ChatRole;
  user_id: string | null;
  phone: string | null;
  token_tail: string | null;
  token_kind: string | null;
  created_by: string | null;
  browser_id: string | null;
  is_blocked: boolean;
  is_moderator: boolean;
}

// Add shared Website A contracts locally; generated Website B types are untouched.
type ChatDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions' | 'Enums'> & {
    Enums: Omit<Database['public']['Enums'], 'app_role'> & { app_role: ChatRole };
    Functions: Omit<Database['public']['Functions'], 'has_role'> & {
      has_role: { Args: { _user_id: string; _role: ChatRole }; Returns: boolean };
      admin_get_chat_sender: { Args: { _message_id: string }; Returns: ChatSender };
      admin_set_moderator: { Args: { _user_id: string; _on: boolean }; Returns: unknown };
      mod_delete_message: { Args: { _message_id: string }; Returns: unknown };
      mod_block_chat: { Args: { _browser_id: string; _name: string; _reason: string }; Returns: unknown };
      mod_unblock_chat: { Args: { _browser_id: string }; Returns: unknown };
    };
  };
};
export const chatBackend = supabase as unknown as SupabaseClient<ChatDatabase>;

export function chatPermissions(isAdmin: boolean, isModerator: boolean) {
  return { inspect: isAdmin || isModerator, moderate: isAdmin || isModerator, pin: isAdmin, assignModerator: isAdmin, viewPhone: isAdmin };
}

export function visibleSender(sender: ChatSender, isAdmin: boolean): ChatSender {
  return { ...sender, phone: isAdmin ? sender.phone : null, token_tail: sender.token_tail?.slice(-6) || null };
}

export function chatAccessParams(search: string, stored: MembershipCredentials | null) {
  const params = new URLSearchParams(search);
  return {
    token: params.get('t') || params.get('token') || undefined,
    mtoken: params.get('mtoken') || stored?.token || undefined,
    btoken: params.get('btoken') || undefined,
    pw: params.get('pw') || params.get('mp') || stored?.password || undefined,
  };
}

export function currentChatAccess() {
  return chatAccessParams(window.location.search, readMembershipCredentials());
}

export function tokenCreatorLabel(createdBy: string | null) {
  if (createdBy === 'admin') return 'Dibuat Admin';
  if (createdBy?.startsWith('reseller:')) return `Dibuat Reseller ${createdBy.slice(9)}`;
  if (createdBy === 'pembelian') return 'Pembelian';
  return '—';
}