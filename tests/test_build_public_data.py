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
        ]

        summary = build_public_data.summarize(activities)

        self.assertEqual(summary["totals"]["activities"], 2)
        self.assertEqual(summary["totals"]["distance_km"], 25.4)
        self.assertEqual(summary["totals"]["moving_hours"], 1.42)
        self.assertEqual(summary["by_type"]["Run"]["count"], 1)
        self.assertEqual(summary["monthly"]["2026-05"]["distance_km"], 5.0)
        self.assertEqual(summary["recent"][0]["name"], "Morning Run")

    def test_main_writes_empty_summary_when_raw_data_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with patch.object(build_public_data, "RAW_PATH", root / "missing.json"):
                with patch.object(build_public_data, "PUBLIC_DATA_DIR", root / "public" / "data"):
                    build_public_data.main()

            output = root / "public" / "data" / "summary.json"
            self.assertTrue(output.exists())
            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(payload["totals"]["activities"], 0)


if __name__ == "__main__":
    unittest.main()
