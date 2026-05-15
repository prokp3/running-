import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RAW_PATH = Path("raw_data/strava_activities.json")
PUBLIC_DATA_DIR = Path("public/data")


def load_payload() -> dict[str, Any]:
    if not RAW_PATH.exists():
        return {}

    return json.loads(RAW_PATH.read_text(encoding="utf-8"))


def load_activities() -> list[dict[str, Any]]:
    return load_payload().get("activities", [])


def km(meters: float | int | None) -> float:
    return round(float(meters or 0) / 1000, 2)


def moving_hours(seconds: float | int | None) -> float:
    return round(float(seconds or 0) / 3600, 2)


def decode_polyline(polyline: str) -> list[list[float]]:
    coordinates = []
    index = 0
    latitude = 0
    longitude = 0

    while index < len(polyline):
        lat_change, index = decode_polyline_value(polyline, index)
        lng_change, index = decode_polyline_value(polyline, index)
        latitude += lat_change
        longitude += lng_change
        coordinates.append([round(longitude * 1e-5, 5), round(latitude * 1e-5, 5)])

    return coordinates


def decode_polyline_value(polyline: str, index: int) -> tuple[int, int]:
    result = 0
    shift = 0

    while True:
        value = ord(polyline[index]) - 63
        index += 1
        result |= (value & 0x1F) << shift
        shift += 5
        if value < 0x20:
            break

    change = ~(result >> 1) if result & 1 else result >> 1
    return change, index


def activity_polyline(activity: dict[str, Any]) -> str | None:
    map_data = activity.get("map") or {}
    return map_data.get("summary_polyline") or map_data.get("polyline")


def build_routes_geojson(activities: list[dict[str, Any]]) -> dict[str, Any]:
    features = []

    for activity in activities:
        polyline = activity_polyline(activity)
        if not polyline:
            continue

        coordinates = decode_polyline(polyline)
        if len(coordinates) < 2:
            continue

        activity_type = activity.get("sport_type") or activity.get("type") or "Activity"
        activity_id = activity.get("id")
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coordinates},
                "properties": {
                    "id": activity_id,
                    "name": activity.get("name", "Untitled activity"),
                    "type": activity_type,
                    "start": activity.get("start_date_local") or activity.get("start_date"),
                    "distance_km": km(activity.get("distance")),
                    "moving_hours": moving_hours(activity.get("moving_time")),
                    "url": f"https://www.strava.com/activities/{activity_id}" if activity_id else None,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def summarize(activities: list[dict[str, Any]]) -> dict[str, Any]:
    by_type: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "distance_km": 0.0, "moving_hours": 0.0, "elevation_m": 0.0}
    )
    monthly: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "distance_km": 0.0, "moving_hours": 0.0}
    )
    recent = []

    for activity in activities:
        activity_type = activity.get("sport_type") or activity.get("type") or "Activity"
        distance_km = km(activity.get("distance"))
        hours = moving_hours(activity.get("moving_time"))
        elevation = round(float(activity.get("total_elevation_gain") or 0), 1)
        start = activity.get("start_date_local") or activity.get("start_date")
        month = start[:7] if start else "unknown"

        by_type[activity_type]["count"] += 1
        by_type[activity_type]["distance_km"] += distance_km
        by_type[activity_type]["moving_hours"] += hours
        by_type[activity_type]["elevation_m"] += elevation

        monthly[month]["count"] += 1
        monthly[month]["distance_km"] += distance_km
        monthly[month]["moving_hours"] += hours

        recent.append(
            {
                "name": activity.get("name", "Untitled activity"),
                "type": activity_type,
                "start": start,
                "distance_km": distance_km,
                "moving_hours": hours,
                "elevation_m": elevation,
                "url": f"https://www.strava.com/activities/{activity.get('id')}" if activity.get("id") else None,
            }
        )

    total_distance = round(sum(item["distance_km"] for item in by_type.values()), 2)
    total_hours = round(sum(item["moving_hours"] for item in by_type.values()), 2)
    total_elevation = round(sum(item["elevation_m"] for item in by_type.values()), 1)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "activities": len(activities),
            "distance_km": total_distance,
            "moving_hours": total_hours,
            "elevation_m": total_elevation,
        },
        "by_type": dict(sorted(by_type.items())),
        "monthly": dict(sorted(monthly.items())),
        "recent": sorted(recent, key=lambda item: item.get("start") or "", reverse=True)[:20],
    }


def main() -> None:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = load_payload()
    activities = payload.get("activities", [])
    summary = summarize(activities)
    summary["source"] = payload.get("source")
    summary["source_fetched_at"] = payload.get("fetched_at")
    routes = build_routes_geojson(activities)
    status = {
        "source": payload.get("source"),
        "source_fetched_at": payload.get("fetched_at"),
        "generated_at": summary["generated_at"],
        "activity_count": len(activities),
        "route_count": len(routes["features"]),
        "update_frequency": "Every 6 hours via GitHub Actions",
    }
    (PUBLIC_DATA_DIR / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (PUBLIC_DATA_DIR / "routes.geojson").write_text(json.dumps(routes, indent=2), encoding="utf-8")
    (PUBLIC_DATA_DIR / "status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    print(f"Wrote {PUBLIC_DATA_DIR / 'summary.json'}")
    print(f"Wrote {PUBLIC_DATA_DIR / 'routes.geojson'}")
    print(f"Wrote {PUBLIC_DATA_DIR / 'status.json'}")


if __name__ == "__main__":
    main()
