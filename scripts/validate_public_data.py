import json
from pathlib import Path


PUBLIC_DATA_DIR = Path("public/data")


def read_json(name: str) -> dict:
    path = PUBLIC_DATA_DIR / name
    if not path.exists():
        raise SystemExit(f"Missing generated data file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    summary = read_json("summary.json")
    status = read_json("status.json")
    routes = read_json("routes.geojson")

    summary_count = int(summary.get("totals", {}).get("activities") or 0)
    status_count = int(status.get("activity_count") or 0)
    route_count = len(routes.get("features", []))

    if status_count and not summary_count:
        raise SystemExit("status.json reports imported activities, but summary.json is empty.")

    if int(status.get("route_count") or 0) != route_count:
        raise SystemExit("status.json route_count does not match routes.geojson.")

    print(f"Validated public data: {summary_count} activities, {route_count} routes.")


if __name__ == "__main__":
    main()
