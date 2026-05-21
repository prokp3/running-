# RUUNNNNNNN

Python-first pipeline for pulling activity data from Strava, shaping it into static JSON, and publishing a lightweight running dashboard.

## Architecture

GitHub Pages can host the fitness dashboard frontend, but it cannot safely run token refresh or API calls with secrets. This project keeps Strava secrets in GitHub Actions and publishes only generated public JSON:

1. GitHub Actions runs on a schedule.
2. Python refreshes the Strava access token.
3. Python pulls recent activities.
4. Python writes static JSON to `public/data/`.
5. Python decodes Strava route polylines into `public/data/routes.geojson`.
6. Python writes `public/data/status.json` with the latest sync metadata.
7. GitHub Pages serves the frontend from `public/`.

Garmin support is planned as a second source. The official Garmin Connect APIs require access through the Garmin Connect Developer Program, so this scaffold keeps provider code modular instead of baking in an unofficial login scraper.

## Local Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Strava Setup

Create a Strava app at <https://www.strava.com/settings/api>.

Set these environment variables locally:

```powershell
$env:STRAVA_CLIENT_ID="your_client_id"
$env:STRAVA_CLIENT_SECRET="your_client_secret"
$env:STRAVA_REFRESH_TOKEN="your_refresh_token"
```

To generate an authorization URL:

```powershell
python scripts/strava_auth_url.py --client-id $env:STRAVA_CLIENT_ID --redirect-uri http://localhost/exchange_token
```

Open the URL, authorize, copy the `code` from the redirected URL, then exchange it:

```powershell
python scripts/exchange_strava_code.py --code "paste_code_here"
```

The exchange prints a refresh token. Keep it private.

## Fetch Data

```powershell
python scripts/fetch_strava.py
python scripts/build_public_data.py
```

Then open `public/index.html` in a browser.

Route maps are generated from Strava's activity `map.summary_polyline` / `map.polyline` fields when they are available. Activities without GPS data, hidden maps, or privacy-trimmed sections may produce no route or only a shortened route.

The map opens around the densest cluster of your running route points when route data is available. The stats also include a Diet Coke can equivalent for run distance, using a 122 mm can height.

To try the frontend with sample data before connecting Strava:

```powershell
New-Item -ItemType Directory -Force raw_data
Copy-Item sample_data/strava_activities.json raw_data/strava_activities.json
python scripts/build_public_data.py
```

## GitHub Pages

This repo includes two workflows:

- `.github/workflows/update-data.yml` refreshes Strava data every six hours, rebuilds `public/data/summary.json`, `public/data/routes.geojson`, and `public/data/status.json`, commits generated data, and deploys `public/` to GitHub Pages.
- `.github/workflows/pages.yml` deploys `public/` when you push normal site changes to `main`.

In your GitHub repo, go to **Settings > Pages** and choose **GitHub Actions** as the source.

The schedule is:

```yaml
cron: "17 */6 * * *"
```

GitHub schedules run in UTC, so this triggers around 00:17, 06:17, 12:17, and 18:17 UTC each day. GitHub may delay scheduled jobs a little during busy periods.

If the page still shows an empty summary after secrets are configured, open **Actions > Update fitness data > Run workflow**. The workflow now validates that `summary.json`, `routes.geojson`, and `status.json` agree before deploying.

## Tests

```powershell
python -m unittest discover -s tests
```

## GitHub Secrets

Add these repository secrets before enabling the workflow:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`
- `TOKEN_STATE_PASSPHRASE`

`TOKEN_STATE_PASSPHRASE` is used to encrypt the latest Strava refresh token into `.state/strava_token.json.enc`. That keeps the scheduled workflow working even if Strava rotates the refresh token, without publishing the token itself.

Generate a strong passphrase locally and save it only as a GitHub secret.

## Login And Signup

The login/signup system uses static frontend pages plus serverless API routes:

- `public/login.html`
- `public/signup.html`
- `public/auth.js`
- `api/signup.js`
- `api/login.js`
- `api/_usersStore.js`

The API routes create or update an Excel workbook named `users.xlsx` in a GitHub repository. Each row contains:

- `username`
- `email`
- `password` - stored as a PBKDF2 hash, not plaintext
- `signup date/time`

Install the Node dependency used for Excel handling:

```powershell
npm install
```

Required deployment environment variables:

- `GITHUB_TOKEN` - a fine-grained GitHub Personal Access Token with Contents read/write access to the target repo
- `GITHUB_OWNER` - repo owner or org
- `GITHUB_REPO` - repo name where `users.xlsx` should live
- `GITHUB_BRANCH` - branch to write to, defaults to `main`
- `USERS_XLSX_PATH` - workbook path, defaults to `users.xlsx`
- `AUTH_SESSION_SECRET` - long random secret used to sign localStorage session tokens

Local development example:

```powershell
$env:GITHUB_TOKEN="github_pat_..."
$env:GITHUB_OWNER="your-user"
$env:GITHUB_REPO="your-repo"
$env:GITHUB_BRANCH="main"
$env:USERS_XLSX_PATH="users.xlsx"
$env:AUTH_SESSION_SECRET="generate-a-long-random-string"
npm install
npx vercel dev
```

Deploy with Vercel:

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Set the environment variables above in Vercel project settings.
4. Deploy.

GitHub Pages cannot run the `/api/signup` and `/api/login` serverless functions. If you deploy only to GitHub Pages, the fitness dashboard will work, but login/signup will not be able to write `users.xlsx`.

Security limitations:

- A frontend-only app cannot keep a GitHub token secret. Any token shipped to browser JavaScript can be stolen.
- This implementation keeps the token in serverless environment variables and never sends it to the browser.
- localStorage sessions are convenient but weaker than secure HTTP-only cookies. A future production version should move sessions to HTTP-only cookies, add rate limiting, add email verification, and avoid using Excel as the primary user database.

## Useful Official Docs

- [Strava API getting started](https://developers.strava.com/docs/getting-started/)
- [Strava authentication](https://developers.strava.com/docs/authentication/)
- [Strava rate limits](https://developers.strava.com/docs/rate-limits/)
- [Garmin Connect Developer Program overview](https://developer.garmin.com/gc-developer-program/overview/)
- [Garmin Activity API](https://developer.garmin.com/gc-developer-program/activity-api/)
