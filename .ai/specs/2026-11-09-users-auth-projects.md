# Users, bearer auth and the three-project account

Status: **implemented**.
Refs: #183
Builds on: `docs/architecture/api.md`, `docs/architecture/data-model.md`.

## 📝 TLDR

SewCraft gains email/password accounts and ownership. Registration and login
return a Sanctum personal access token; every project route requires a signed-in
account. An account may own at most three projects. Every signed-in account may
read every project, but only the owner may update, delete or save it. Projects
created before accounts existed are deleted by the migration.

This is deliberately a small, self-hosted multi-user model, not a billing or
sharing system: private projects, teams and a paywall come later.

## 📝 Decisions

| # | Decision |
| - | -------- |
| D1 | The whole app sits behind login. There is no anonymous gallery or share link yet. |
| D2 | Public means readable by every signed-in account. Owner-only routes are update, delete and pattern save. |
| D3 | One account owns at most three projects; the server is the authority and the list surfaces `my_project_count`. |
| D4 | Existing projects are deleted in the migration rather than assigned an invented owner. |
| D5 | Auth is Sanctum personal access tokens sent as `Authorization: Bearer`, keeping the API stateless. Tokens live in `localStorage`. |
| D6 | Registration is email + password + confirmation. A display name is derived from the email local part; email verification and password reset are out of scope. |
| D7 | A non-owner opens the editor read-only. The project settings action is disabled; the save path is also refused by policy. |
| D8 | The project list shows all public projects with the owner email and a `Yours`/owner marker; Settings and Delete exist only on owned rows. |

Token storage in `localStorage` is the conscious v1 trade-off. Moving to httpOnly
cookies is a later hardening step; the frontend keeps the token in one API-client
boundary so that change stays local.

## 📝 Data model

- `projects.user_id` — required FK to `users`, cascade on delete.
- `personal_access_tokens` — Sanctum's table.
- `users` — the default Laravel table (email, password, name, timestamps).
- Migration `2026_11_09_000001_add_user_id_to_projects_table` deletes existing
  project rows, then adds `user_id`.

## 📝 API

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/api/register` | 201 with `{ data: { user, token } }`; normalised lowercase email |
| POST | `/api/login` | 200 with `{ data: { user, token } }`; same failure for unknown email and bad password |
| POST | `/api/logout` | 204; deletes the current token |
| GET | `/api/user` | The signed-in account |
| GET | `/api/commands` | Public command spec |
| GET | `/api/projects` | Every project, paginated; `my_project_count` at the top level |
| POST | `/api/projects` | Owner is the request account; 422 at four projects |
| GET | `/api/projects/{id}` | Any signed-in account |
| PUT | `/api/projects/{id}` | Owner only |
| DELETE | `/api/projects/{id}` | Owner only |
| GET | `/api/projects/{id}/pattern` | Any signed-in account |
| PUT | `/api/projects/{id}/pattern` | Owner only |

`ProjectResource` adds `user_id`, `can_edit` and `owner` (when loaded).
`ProjectPolicy` owns `update` and `delete`; the pattern save reuses `update`.

The create limit runs in a transaction with a `lockForUpdate` on the user row so
two concurrent creates cannot both pass the check.

## 📝 Frontend

- `api/client.ts` — one JSON client, bearer-token injection, `ApiError`.
- `api/auth.ts`, `stores/auth.ts` — register, login, logout, boot-time `restore`.
- `/login` and `/register` views; a global router guard redirects signed-out
  visitors to `/login?redirect=…` and signed-in visitors off the auth screens.
- `App.vue` shows the account email and a logout action outside the editor.
- `ProjectsView` shows the quota, disables creation at three, displays the server
  create error, and hides owner actions on rows the account does not own.
- `useProjectSession` sets the editor read-only when `can_edit` is false;
  `EditorTopBar` disables project settings for a non-owner.

## 📝 Edge cases

- A revoked/expired token fails `/api/user` at boot; the store clears it and the
  guard sends the browser to login.
- A failed logout still clears the local token and account.
- A stale list count is harmless; the server re-checks the limit on create.
- Deleting a user cascades their projects, patterns, versions and exports.
- A project row that disappears while a non-owner is viewing it still returns 404
  from the editor load and renders the existing load-error state.

## 📝 Verification

- Backend: 70 Pest tests, 100% coverage (`app/**`).
- Frontend: 120 files / 1,673 tests, 100% coverage.
- Geometry: 36 files / 1,155 tests.
- `npm run lint`, `npm run typecheck`, `npm run format:check`.
- Smoke: register → `/api/user`; three creates succeed, the fourth returns 422.

## 📝 Out of scope

- Email verification, password reset, profile editing.
- Private projects, sharing links, teams, a paywall.
- Refresh tokens, httpOnly cookie auth, token expiry and device management.
