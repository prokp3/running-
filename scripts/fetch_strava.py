import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


TOKEN_URL = "https://www.strava.com/oauth/token"
ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
RAW_DIR = Path("raw_data")
TOKEN_FILE = Path(os.getenv("STRAVA_TOKEN_FILE", RAW_DIR / "strava_token.json"))


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"{name} is required.")
    return value


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError as error:
        raise SystemExit(f"{name} must be an integer.") from error


def current_refresh_token() -> str:
    if TOKEN_FILE.exists():
        payload = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
        refresh_token = payload.get("refresh_token")
        if refresh_token:
            return refresh_token

    return require_env("STRAVA_REFRESH_TOKEN")


def refresh_access_token() -> dict[str, Any]:
    payload = urlencode(
        {
            "client_id": require_env("STRAVA_CLIENT_ID"),
            "client_secret": require_env("STRAVA_CLIENT_SECRET"),
            "refresh_token": current_refresh_token(),
            "grant_type": "refresh_token",
        }
    ).encode("utf-8")
    request = Request(TOKEN_URL, data=payload, method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8")
        raise SystemExit(f"Strava token refresh failed: {error.code} {body}") from error


def fetch_activities(access_token: str, per_page: int = 100, max_pages: int = 5) -> list[dict[str, Any]]:
    activities: list[dict[str, Any]] = []

    for page in range(1, max_pages + 1):
        query = urlencode({"page": page, "per_page": per_page})
        request = Request(f"{ACTIVITIES_URL}?{query}", method="GET")
        request.add_header("Authorization", f"Bearer {access_token}")

        try:
            with urlopen(request, timeout=30) as response:
                batch = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            body = error.read().decode("utf-8")
            raise SystemExit(f"Strava activity fetch failed: {error.code} {body}") from error

        if not batch:
            break
        activities.extend(batch)

    return activities


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def main() -> None:
    token = refresh_access_token()
    activities = fetch_activities(token["access_token"], max_pages=env_int("STRAVA_MAX_PAGES", 5))
    fetched_at = datetime.now(timezone.utc).isoformat()

    write_json(
        RAW_DIR / "strava_activities.json",
        {
            "source": "strava",
            "fetched_at": fetched_at,
            "activities": activities,
        },
    )
    write_json(
        TOKEN_FILE,
        {
            "refresh_token": token["refresh_token"],
            "expires_at": token.get("expires_at"),
            "updated_at": fetched_at,
        },
    )
    print(f"Fetched {len(activities)} Strava activities at {fetched_at}.")


if __name__ == "__main__":
    main()
