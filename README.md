# Fitness Stats Website

Python-first pipeline for pulling activity data from Strava, shaping it into static JSON, and publishing a lightweight website on GitHub Pages.

## Architecture

GitHub Pages can host the frontend, but it cannot safely run token refresh or API calls with secrets. This project keeps secrets in GitHub Actions and publishes only generated public JSON:

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

## Useful Official Docs

- [Strava API getting started](https://developers.strava.com/docs/getting-started/)
- [Strava authentication](https://developers.strava.com/docs/authentication/)
- [Strava rate limits](https://developers.strava.com/docs/rate-limits/)
- [Garmin Connect Developer Program overview](https://developer.garmin.com/gc-developer-program/overview/)
- [Garmin Activity API](https://developer.garmin.com/gc-developer-program/activity-api/)
