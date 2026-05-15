import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import validate_public_data


class ValidatePublicDataTests(unittest.TestCase):
    def test_rejects_nonempty_status_with_empty_summary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            (data_dir / "summary.json").write_text(
                json.dumps({"totals": {"activities": 0}}),
                encoding="utf-8",
            )
            (data_dir / "status.json").write_text(
                json.dumps({"activity_count": 4, "route_count": 1}),
                encoding="utf-8",
            )
            (data_dir / "routes.geojson").write_text(
                json.dumps({"type": "FeatureCollection", "features": [{}]}),
                encoding="utf-8",
            )

            with patch.object(validate_public_data, "PUBLIC_DATA_DIR", data_dir):
                with self.assertRaises(SystemExit):
                    validate_public_data.main()


if __name__ == "__main__":
    unittest.main()
