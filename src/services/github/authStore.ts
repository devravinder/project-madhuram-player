// The only module that reads or writes the GitHub token.
const TOKEN_KEY = "madhuram.github.token";
const USER_KEY = "madhuram.github.user";
const GUEST_KEY = "madhuram.guest";

export type GithubUser = { login: string; avatarUrl: string };

export type AuthStatus = "signed-in" | "guest" | "signed-out";

export type AuthSnapshot = {
  status: AuthStatus;
  token: string | null;
  user: GithubUser | null;
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the session then lasts until reload.
  }
};

function load(): AuthSnapshot {
  const token = read(TOKEN_KEY);
  const rawUser = read(USER_KEY);
  const user = token && rawUser ? (JSON.parse(rawUser) as GithubUser) : null;
  const status: AuthStatus = token
    ? "signed-in"
    : read(GUEST_KEY)
      ? "guest"
      : "signed-out";
  return { status, token, user };
}

let snapshot = load();
const listeners = new Set<() => void>();

function update(change: () => void) {
  change();
  snapshot = load();
  listeners.forEach((listener) => listener());
}

export const authStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,
  getToken: () => snapshot.token,

  signIn(token: string, user: GithubUser) {
    update(() => {
      write(TOKEN_KEY, token);
      write(USER_KEY, JSON.stringify(user));
      write(GUEST_KEY, null);
    });
  },
  continueAsGuest() {
    update(() => write(GUEST_KEY, "1"));
  },
  // Back to the login page without touching local music.
  requestLogin() {
    update(() => write(GUEST_KEY, null));
  },
  // Removes the token from this device only; GitHub still honours it until revoked.
  removeToken() {
    update(() => {
      write(TOKEN_KEY, null);
      write(USER_KEY, null);
      write(GUEST_KEY, "1");
    });
  },
};
