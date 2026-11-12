function required(name: string): string {
  const value = import.meta.env[name];
  if (!value) throw new Error(`Missing env value: ${name}`);
  return value;
}

function requiredNumber(name: string): number {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Env value must be a positive number: ${name}`);
  }
  return value;
}

export const config = {
  libraryRepoName: required("VITE_LIBRARY_REPO_NAME"), // the first library
  homeRepoName: required("VITE_HOME_REPO_NAME"), // private: playlists, library list
  maxFileBytes: requiredNumber("VITE_MAX_FILE_BYTES"),
  maxRepoBytes: requiredNumber("VITE_MAX_REPO_BYTES"),
  isDev: import.meta.env.DEV,
} as const;
