export type TeamAccessStatus = "active" | "blocked";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  status: TeamAccessStatus;
  mustChangePassword: boolean;
  lastSignInAt: string | null;
  isSelf: boolean;
  isOwner: boolean;
};

export type AccessLogEntry = {
  id: string;
  occurredAt: string;
  kind: "access" | "edit";
  summary: string;
};

export function memberDefaults(
  member: Pick<TeamMember, "id" | "name" | "email"> & Partial<TeamMember>,
): TeamMember {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    status: member.status === "blocked" ? "blocked" : "active",
    mustChangePassword: member.mustChangePassword === true,
    lastSignInAt: typeof member.lastSignInAt === "string" ? member.lastSignInAt : null,
    isSelf: member.isSelf === true,
    isOwner: member.isOwner === true,
  };
}

export function parseTeamMembers(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.name !== "string") {
      return [];
    }

    return [
      memberDefaults({
        id: record.id,
        name: record.name,
        email: typeof record.email === "string" ? record.email : "",
        status: record.blocked === true ? "blocked" : "active",
        mustChangePassword: record.mustChangePassword === true,
        lastSignInAt: typeof record.lastSignInAt === "string" ? record.lastSignInAt : null,
        isSelf: record.isSelf === true,
        isOwner: record.isOwner === true,
      }),
    ];
  });
}

export function parseAccessLog(value: unknown): AccessLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.summary !== "string") {
      return [];
    }

    if (typeof record.occurredAt !== "string") {
      return [];
    }

    return [
      {
        id: record.id,
        occurredAt: record.occurredAt,
        kind: record.kind === "edit" ? "edit" : "access",
        summary: record.summary,
      },
    ];
  });
}
