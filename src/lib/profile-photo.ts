export function loggedInPhotoUrl(
  user?: { avatar?: string | null; employee?: { avatar?: string | null } | null } | null,
): string | null {
  return firstPhotoUrl(user?.employee?.avatar, user?.avatar);
}

export function employeePhotoUrl(
  employee?: { avatar?: string | null; user?: { avatar?: string | null } | null } | null,
): string | null {
  return firstPhotoUrl(employee?.avatar, employee?.user?.avatar);
}

function firstPhotoUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const url of candidates) {
    if (url && String(url).trim()) return url;
  }
  return null;
}
