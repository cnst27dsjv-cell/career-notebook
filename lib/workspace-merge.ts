import type { Application, Data } from "./types";

export function mergeWorkspaceData(
  current: Data | undefined,
  incoming: Data,
): Data {
  if (!current || !incoming.partial) return incoming;
  return {
    ...current,
    ...(incoming.scope === "applications"
      ? { resumes: incoming.resumes, files: incoming.files }
      : {}),
    applications: incoming.applications,
    events: incoming.events,
    settings: incoming.settings,
    services: incoming.services,
    user: incoming.user,
  };
}

export function acceptSavedApplication(
  current: Data,
  saved: Application,
): Data {
  const old = current.applications.find((item) => item.id === saved.id);
  if (old && old.version > saved.version) return current;
  return {
    ...current,
    applications: [
      saved,
      ...current.applications.filter((item) => item.id !== saved.id),
    ],
  };
}
