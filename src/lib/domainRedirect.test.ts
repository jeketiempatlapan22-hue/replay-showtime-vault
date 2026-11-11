import { describe, it, expect } from 'vitest';
import { skipDomainRedirect } from './domainRedirect';

describe('skipDomainRedirect', () => {
  it('keeps the admin live monitor on the admin domain', () => {
    expect(skipDomainRedirect('/live', '?show=x&admin_monitor=1', false)).toBe(true);
    expect(skipDomainRedirect('/live', '?show=x', true)).toBe(true);
  });
  it('still redirects normal viewers', () => {
    expect(skipDomainRedirect('/live', '?show=x&t=abc', false)).toBe(false);
  });
});
