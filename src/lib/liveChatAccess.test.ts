import { describe, expect, it } from 'vitest';
import { chatPermissions, chatAccessParams, visibleSender, type ChatSender } from './liveChatAccess';

describe('shared chat rules', () => {
  it('only admins see phone numbers, assign moderators, and pin', () => {
    expect(chatPermissions(true, false)).toEqual({ inspect: true, moderate: true, pin: true, assignModerator: true, viewPhone: true });
    expect(chatPermissions(false, true)).toEqual({ inspect: true, moderate: true, pin: false, assignModerator: false, viewPhone: false });
    expect(chatPermissions(false, false).inspect).toBe(false);
    expect(chatPermissions(false, false).moderate).toBe(false);
  });
  it('redacts phone numbers for moderators and limits token info to six characters', () => {
    const sender = { phone: '08123456789', token_tail: 'abcdefghij' } as ChatSender;
    expect(visibleSender(sender, false).phone).toBeNull();
    expect(visibleSender(sender, true).phone).toBe('08123456789');
    expect(visibleSender(sender, true).token_tail).toBe('efghij');
  });
  it('forwards show, membership, bundle and password access from URLs', () => {
    expect(chatAccessParams('?t=show123&mtoken=member123&btoken=bundle123&mp=ABC123', null)).toEqual({ token: 'show123', mtoken: 'member123', btoken: 'bundle123', pw: 'ABC123' });
  });
  it('uses saved membership credentials when URL access is absent', () => {
    expect(chatAccessParams('', { token: 'saved-member', password: 'saved-pw', saved_at: 0 })).toEqual({ token: undefined, btoken: undefined, mtoken: 'saved-member', pw: 'saved-pw' });
  });
});