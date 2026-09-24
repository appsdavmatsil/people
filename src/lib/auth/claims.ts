export function mustChangePassword(
  value: { user_metadata?: unknown } | null | undefined,
) {
  const metadata = value?.user_metadata;
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  return (
    "must_change_password" in metadata &&
    (metadata as { must_change_password?: unknown }).must_change_password === true
  );
}
