export function loggedInPhotoUrl(
  user?: { avatar?: string | null; employee?: { avatar?: string | null } | null } | null,
): string | null {
  const url = user?.employee?.avatar || user?.avatar;
  if (!url || !String(url).trim()) return null;
  return url;
}
