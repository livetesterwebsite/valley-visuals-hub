export type MemberProfileDetails = {
  full_name: string;
  phone: string | null;
  birthday: string | null;
};

export function hasCompleteMemberProfile(profile: MemberProfileDetails | null | undefined) {
  return Boolean(
    profile?.full_name.trim() &&
    profile.phone?.trim() &&
    profile.birthday,
  );
}