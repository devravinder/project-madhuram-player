# No organisation-specific information in the repo

This is an open-source project. Tracked files (code, docs, ADRs, skills, scripts, commit messages) must not
contain the name of any company or team, internal registry hosts or image paths, internal URLs, usernames,
machine names or other details of the environment it happens to be developed in.

- Write generic names: "a private registry", `<deploy-domain>`.
- Environment-specific values go in git-ignored local files: `.env`, `*.local`, `deploy.local`.
- Before committing, search staged files for such details (`git grep --cached -i <term>`).
