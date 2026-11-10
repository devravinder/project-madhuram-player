import { HttpError } from "@/services/httpError";
import type { GithubUser } from "./authStore";

const API = "https://api.github.com";

export const NEW_TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new";
export const TOKEN_SETTINGS_URL =
  "https://github.com/settings/personal-access-tokens";

export async function fetchGithubUser(token: string): Promise<GithubUser> {
  let response: Response;
  try {
    response = await fetch(`${API}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch {
    throw new HttpError(0, "Cannot reach GitHub. Check your connection.");
  }

  if (response.status === 401) {
    throw new HttpError(401, "Token is invalid or has expired.");
  }
  if (!response.ok) {
    throw new HttpError(response.status, `GitHub returned ${response.status}.`);
  }

  const body = (await response.json()) as { login: string; avatar_url: string };
  return { login: body.login, avatarUrl: body.avatar_url };
}
