export function formatActorLabel(
  entry: {
    actor_username?: string | null;
    actor_user_id?: number | null;
    source?: string | null;
  },
  t: (key: string) => string,
): string {
  if (entry.actor_username) return entry.actor_username;
  if (entry.actor_user_id != null) {
    return `${t("audit.unknown_user")} #${entry.actor_user_id}`;
  }
  if (
    !entry.source ||
    entry.source === "migration" ||
    entry.source === "data_cleanup"
  ) {
    return t("audit.system_user");
  }
  return "—";
}
