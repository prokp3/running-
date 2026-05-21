import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import build_public_data


class BuildPublicDataTests(unittest.TestCase):
    def test_summarize_groups_totals_and_recent_activities(self) -> None:
        activities = [
            {
                "id": 10,
                "name": "Morning Run",
                "sport_type": "Run",
                "distance": 5000,
                "moving_time": 1500,
                "total_elevation_gain": 42.5,
                "start_date_local": "2026-05-14T06:30:00Z",
                "map": {"summary_polyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
            },
            {
                "id": 11,
                "name": "Lunch Ride",
                "type": "Ride",
                "distance": 20400,
                "moving_time": 3600,
                "total_elevation_gain": 110,
                "start_date_local": "2026-04-02T12:00:00Z",
            },
            {
                "id": 12,
                "name": "Gym",
                "sport_type": "WeightTraining",
                "distance": 0,
                "moving_time": 1800,
                "start_date_local": "2026-05-01T07:00:00Z",
            },
        ]

        summary = build_public_data.summarize(activities)

        self.assertEqual(summary["totals"]["activities"], 2)
        self.assertEqual(summary["totals"]["distance_km"], 25.4)
        self.assertEqual(summary["totals"]["run_distance_km"], 5.0)
        self.assertEqual(summary["totals"]["diet_coke_cans"], 40984)
        self.assertEqual(summary["totals"]["moving_hours"], 1.42)
        self.assertEqual(summary["by_type"]["Run"]["count"], 1)
        self.assertNotIn("WeightTraining", summary["by_type"])
        self.assertEqual(summary["monthly"]["2026-05"]["distance_km"], 5.0)
        self.assertEqual(summary["recent"][0]["name"], "Morning Run")
        self.assertEqual(len(summary["activities"]), 2)

    def test_build_routes_geojson_decodes_activity_polylines(self) -> None:
        routes = build_public_data.build_routes_geojson(
            [
                {
                    "id": 10,
                    "name": "Morning Run",
                    "sport_type": "Run",
                    "distance": 5000,
                    "moving_time": 1500,
                    "total_elevation_gain": 42.5,
                    "location_country": "India",
                    "start_date_local": "2026-05-14T06:30:00Z",
                    "map": {"summary_polyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                },
                {
                    "id": 11,
                    "name": "Zero Distance",
                    "sport_type": "Run",
                    "distance": 0,
                    "moving_time": 500,
                    "start_date_local": "2026-05-14T06:30:00Z",
                    "map": {"summary_polyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                }
            ]
        )

        self.assertEqual(routes["type"], "FeatureCollection")
        self.assertEqual(len(routes["features"]), 1)
        self.assertEqual(routes["features"][0]["geometry"]["type"], "LineString")
        self.assertEqual(routes["features"][0]["geometry"]["coordinates"][0], [-120.2, 38.5])
        self.assertEqual(routes["features"][0]["properties"]["location_country"], "India")
        self.assertEqual(routes["features"][0]["properties"]["raw"]["id"], 10)

    def test_concentrated_route_center_prefers_densest_run_points(self) -> None:
        routes = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"type": "Run"},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [77.5901, 12.9701],
                            [77.5902, 12.9702],
                            [77.5903, 12.9703],
                            [77.61, 12.99],
                        ],
                    },
                },
                {
                    "type": "Feature",
                    "properties": {"type": "Ride"},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-120.2, 38.5], [-120.95, 40.7]],
                    },
                },
            ],
        }

        center = build_public_data.concentrated_route_center(routes)

        self.assertEqual(center, {"latitude": 12.9702, "longitude": 77.5902})

    def test_main_writes_empty_summary_when_raw_data_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with patch.object(build_public_data, "RAW_PATH", root / "missing.json"):
                with patch.object(build_public_data, "PUBLIC_DATA_DIR", root / "public" / "data"):
                    build_public_data.main()

            output = root / "public" / "data" / "summary.json"
            routes_output = root / "public" / "data" / "routes.geojson"
            status_output = root / "public" / "data" / "status.json"
            self.assertTrue(output.exists())
            self.assertTrue(routes_output.exists())
            self.assertTrue(status_output.exists())
            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(payload["totals"]["activities"], 0)


if __name__ == "__main__":
    unittest.main()
