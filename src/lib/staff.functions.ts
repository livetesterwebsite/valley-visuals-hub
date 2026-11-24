import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

// Member lookup is deliberately not callable from the browser client. These server functions
// verify the caller's staff role with their own session, then use the service role for the lookup.

type StaffContext = {
  userId: string;
  supabase: {
    rpc: (fn: 'has_role', args: { _user_id: string; _role: 'staff' | 'admin' }) => PromiseLike<{ data: boolean | null; error: unknown }>;
  };
};

async function assertStaff({ userId, supabase }: StaffContext) {
  const [staff, admin] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'staff' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
  ]);
  if (staff.error || admin.error || !(staff.data === true || admin.data === true)) {
    throw new Error('Staff access is required.');
  }
}

export type StaffMember = { userId: string; fullName: string; phone: string | null; memberId: string; balance: number; tier: string };
export type StaffRedemption = { code: string; status: string; expiresAt: string; rewardName: string; memberName: string; memberId: string };

export const lookupMember = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ query: z.string().trim().min(4).max(40) }))
  .handler(async ({ data, context }): Promise<StaffMember[]> => {
    await assertStaff(context as unknown as StaffContext);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: rows, error } = await supabaseAdmin.rpc('staff_lookup_member', { _staff: context.userId, _query: data.query });
    if (error) throw new Error('Member lookup failed. Check the member ID or phone number and try again.');
    return (rows ?? []).map((row) => ({
      userId: row.m_user_id, fullName: row.m_full_name, phone: row.m_phone, memberId: row.m_member_id, balance: Number(row.m_balance), tier: row.m_tier,
    }));
  });

export const lookupRedemption = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string().trim().min(6).max(20) }))
  .handler(async ({ data, context }): Promise<StaffRedemption | null> => {
    await assertStaff(context as unknown as StaffContext);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: rows, error } = await supabaseAdmin.rpc('staff_lookup_redemption', { _staff: context.userId, _code: data.code });
    if (error) throw new Error('Code lookup failed. Please try again.');
    const row = rows?.[0];
    return row
      ? { code: row.r_code, status: row.r_status, expiresAt: row.r_expires_at, rewardName: row.r_reward_name, memberName: row.r_member_name, memberId: row.r_member_id }
      : null;
  });
