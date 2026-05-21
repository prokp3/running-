import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RAW_PATH = Path("raw_data/strava_activities.json")
PUBLIC_DATA_DIR = Path("public/data")
DIET_COKE_CAN_HEIGHT_M = 0.122
RUN_TYPES = {"Run", "TrailRun", "VirtualRun"}


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


def distance_positive(activity: dict[str, Any]) -> bool:
    return km(activity.get("distance")) > 0


def is_run(activity_type: str) -> bool:
    return activity_type in RUN_TYPES or "run" in activity_type.lower()


def diet_coke_cans_for_km(distance_km: float) -> int:
    return round((distance_km * 1000) / DIET_COKE_CAN_HEIGHT_M)


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
        if not distance_positive(activity):
            continue

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
                    "elevation_m": round(float(activity.get("total_elevation_gain") or 0), 1),
                    "location_city": activity.get("location_city"),
                    "location_state": activity.get("location_state"),
                    "location_country": activity.get("location_country"),
                    "average_speed": activity.get("average_speed"),
                    "max_speed": activity.get("max_speed"),
                    "average_heartrate": activity.get("average_heartrate"),
                    "max_heartrate": activity.get("max_heartrate"),
                    "raw": activity,
                    "url": f"https://www.strava.com/activities/{activity_id}" if activity_id else None,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def concentrated_route_center(routes: dict[str, Any]) -> dict[str, float] | None:
    points: list[list[float]] = []
    for feature in routes.get("features", []):
        if feature.get("properties", {}).get("type") and not is_run(feature["properties"]["type"]):
            continue
        points.extend(feature.get("geometry", {}).get("coordinates", []))

    if not points:
        for feature in routes.get("features", []):
            points.extend(feature.get("geometry", {}).get("coordinates", []))

    if not points:
        return None

    buckets: dict[tuple[float, float], list[list[float]]] = defaultdict(list)
    for longitude, latitude in points:
        buckets[(round(latitude, 2), round(longitude, 2))].append([longitude, latitude])

    densest_points = max(buckets.values(), key=len)
    longitude = round(sum(point[0] for point in densest_points) / len(densest_points), 5)
    latitude = round(sum(point[1] for point in densest_points) / len(densest_points), 5)
    return {"latitude": latitude, "longitude": longitude}


def summarize(activities: list[dict[str, Any]]) -> dict[str, Any]:
    activities = [activity for activity in activities if distance_positive(activity)]
    by_type: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "distance_km": 0.0, "moving_hours": 0.0, "elevation_m": 0.0}
    )
    monthly: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "distance_km": 0.0, "moving_hours": 0.0}
    )
    recent = []
    activity_details = []
    countries: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "distance_km": 0.0})
    run_distance_km = 0.0

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
        if is_run(activity_type):
            run_distance_km += distance_km
            country = activity.get("location_country") or "Unknown"
            countries[country]["count"] += 1
            countries[country]["distance_km"] += distance_km

        monthly[month]["count"] += 1
        monthly[month]["distance_km"] += distance_km
        monthly[month]["moving_hours"] += hours

        detail = {
            "id": activity.get("id"),
            "name": activity.get("name", "Untitled activity"),
            "type": activity_type,
            "start": start,
            "distance_km": distance_km,
            "moving_hours": hours,
            "elevation_m": elevation,
            "location_city": activity.get("location_city"),
            "location_state": activity.get("location_state"),
            "location_country": activity.get("location_country"),
            "average_speed": activity.get("average_speed"),
            "max_speed": activity.get("max_speed"),
            "average_heartrate": activity.get("average_heartrate"),
            "max_heartrate": activity.get("max_heartrate"),
            "raw": activity,
            "url": f"https://www.strava.com/activities/{activity.get('id')}" if activity.get("id") else None,
        }
        activity_details.append(detail)
        recent.append(detail)

    total_distance = round(sum(item["distance_km"] for item in by_type.values()), 2)
    total_hours = round(sum(item["moving_hours"] for item in by_type.values()), 2)
    total_elevation = round(sum(item["elevation_m"] for item in by_type.values()), 1)
    run_distance_km = round(run_distance_km, 2)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "activities": len(activities),
            "distance_km": total_distance,
            "run_distance_km": run_distance_km,
            "diet_coke_cans": diet_coke_cans_for_km(run_distance_km),
            "moving_hours": total_hours,
            "elevation_m": total_elevation,
        },
        "by_type": dict(sorted(by_type.items())),
        "monthly": dict(sorted(monthly.items())),
        "countries": dict(sorted(countries.items())),
        "activities": sorted(activity_details, key=lambda item: item.get("start") or "", reverse=True),
        "recent": sorted(recent, key=lambda item: item.get("start") or "", reverse=True)[:20],
    }


def main() -> None:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = load_payload()
    activities = payload.get("activities", [])
    visible_activities = [activity for activity in activities if distance_positive(activity)]
    summary = summarize(activities)
    summary["source"] = payload.get("source")
    summary["source_fetched_at"] = payload.get("fetched_at")
    routes = build_routes_geojson(activities)
    summary["map_center"] = concentrated_route_center(routes)
    status = {
        "source": payload.get("source"),
        "source_fetched_at": payload.get("fetched_at"),
        "generated_at": summary["generated_at"],
        "activity_count": len(visible_activities),
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
