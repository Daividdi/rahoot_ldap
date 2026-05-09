# LDAP / Active Directory Setup

## 1. Create your `.env` file

Create a `.env` file **in the same folder as `docker-compose.yml`** (never inside `codigo-fonte` — already gitignored).

```env
LDAP_URL=ldap://your-ad-server:389
LDAP_DOMAIN=company.local
LDAP_SEARCH_BASE=DC=company,DC=local
LDAP_SERVICE_USER=
LDAP_SERVICE_PASS=
```

| Variable | Example | Description |
|---|---|---|
| `LDAP_URL` | `ldap://192.168.1.10:389` | IP or hostname of your AD/LDAP server |
| `LDAP_DOMAIN` | `company.local` | Domain suffix appended to the login username |
| `LDAP_SEARCH_BASE` | `DC=company,DC=local` | Base DN used when searching for users |
| `LDAP_SERVICE_USER` | `svc.rahoot@company.local` | *(optional)* Read-only service account — see note |
| `LDAP_SERVICE_PASS` | `yourpassword` | *(optional)* Password for the service account |

## 2. Service account (optional)

After a user authenticates, the app searches AD for their `displayName` attribute.
In most AD environments an authenticated user can read their own record, so
`LDAP_SERVICE_USER` / `LDAP_SERVICE_PASS` **can be left empty**.

Fill them in only if your AD policy restricts self-search. Use any **read-only** account — no write permissions needed.

## 3. How users log in

Employees enter their **Windows/network username** (without the domain, e.g. `joao.silva`) and their network password.
The app fetches their full `displayName` from AD and uses it everywhere: rankings, game room, leaderboard.

## 4. Rankings filter

Only players who have authenticated via LDAP appear in the rankings.
Guest or legacy entries from before LDAP was required are automatically excluded.

## 5. Start / restart

```bash
# First time
docker compose up -d --build

# After editing .env
docker compose up -d --build
```
