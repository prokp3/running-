import argparse
from urllib.parse import urlencode


def build_auth_url(client_id: str, redirect_uri: str, scope: str) -> str:
    query = urlencode(
        {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "approval_prompt": "force",
            "scope": scope,
        }
    )
    return f"https://www.strava.com/oauth/authorize?{query}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Strava OAuth authorization URL.")
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--redirect-uri", default="http://localhost/exchange_token")
    parser.add_argument("--scope", default="read,activity:read_all")
    args = parser.parse_args()

    print(build_auth_url(args.client_id, args.redirect_uri, args.scope))


if __name__ == "__main__":
    main()
