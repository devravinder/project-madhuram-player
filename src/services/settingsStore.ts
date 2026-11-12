// GitHub allows letters, digits, dots, dashes and underscores.
export const isValidRepoName = (name: string) =>
  /^[A-Za-z0-9._-]{1,100}$/.test(name) &&
  name !== "." &&
  name !== ".." &&
  !name.endsWith(".git");
