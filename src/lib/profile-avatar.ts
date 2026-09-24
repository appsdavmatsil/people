export const profileAvatarEvent = "people-profile-avatar";

export function profileAvatarKey(userId: string) {
  return `people.profile-avatar.${userId}`;
}
