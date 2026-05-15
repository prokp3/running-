import argparse
import json
import os
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen



TOKEN_URL = "https://www.strava.com/oauth/token"


def exchange_code(client_id: str, client_secret: str, code: str) -> dict:
    payload = urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")
    request = Request(TOKEN_URL, data=payload, method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8")
        raise SystemExit(f"Strava token exchange failed: {error.code} {body}") from error


def main() -> None:
    parser = argparse.ArgumentParser(description="Exchange a Strava OAuth code for tokens.")
    parser.add_argument("--code", required=True)
    parser.add_argument("--client-id", default=os.getenv("STRAVA_CLIENT_ID"))
    parser.add_argument("--client-secret", default=os.getenv("STRAVA_CLIENT_SECRET"))
    args = parser.parse_args()

    if not args.client_id or not args.client_secret:
        raise SystemExit("STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are required.")

    token = exchange_code(args.client_id, args.client_secret, args.code)
    print("Save this refresh token as STRAVA_REFRESH_TOKEN:")
    print(token["refresh_token"])


if __name__ == "__main__":
    main()
