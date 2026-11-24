import { describe, expect, it } from 'vitest';
import { hasCompleteMemberProfile } from '@/lib/member-profile';

describe('member profile completion', () => {
  it('requires a name, phone number, and birthday', () => {
    expect(hasCompleteMemberProfile({ full_name: 'Valley Member', phone: '818-555-0142', birthday: '1990-04-12' })).toBe(true);
    expect(hasCompleteMemberProfile({ full_name: 'Valley Member', phone: '818-555-0142', birthday: null })).toBe(false);
    expect(hasCompleteMemberProfile({ full_name: 'Valley Member', phone: null, birthday: '1990-04-12' })).toBe(false);
    expect(hasCompleteMemberProfile({ full_name: ' ', phone: '818-555-0142', birthday: '1990-04-12' })).toBe(false);
  });
});