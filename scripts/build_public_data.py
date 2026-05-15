import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RAW_PATH = Path("raw_data/strava_activities.json")
PUBLIC_DATA_DIR = Path("public/data")


def load_activities() -> list[dict[str, Any]]:
    if not RAW_PATH.exists():
        return []

    payload = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    return payload.get("activities", [])


def km(meters: float | int | None) -> float:
    return round(float(meters or 0) / 1000, 2)


def moving_hours(seconds: float | int | None) -> float:
    return round(float(seconds or 0) / 3600, 2)


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
    summary = summarize(load_activities())
    (PUBLIC_DATA_DIR / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {PUBLIC_DATA_DIR / 'summary.json'}")


if __name__ == "__main__":
    main()
