"""Unit tests for MainController."""

from unittest.mock import patch

from controllers.main_controller import MainController


@patch("controllers.main_controller.scan")
def test_scan_machines_transmet_targets_et_retourne_le_resultat(mock_scan):
    """Forwards the targets to the use case and returns its result."""
    mock_scan.return_value = [{"ip": "10.0.0.1"}]

    with (
        patch(
            "controllers.main_controller.scan",
            return_value=machines,
        ) as mock_scan,
        patch(
            "controllers.main_controller.SnapshotPresenter.to_snapshot",
            return_value=snapshot,
        ) as mock_presenter,
    ):
        result = MainController().scan_machines(["10.0.0.1"])

    mock_scan.assert_called_once_with(["10.0.0.1"])
    mock_presenter.assert_called_once_with(machines)
    assert result == snapshot
    assert result["contractVersion"] == "1.0.0"
    assert "scannedAt" in result
    assert result["devices"] == [
        {
            "ip": "10.0.0.1",
            "mac": None,
            "ports": [],
            "latencyMs": None,
            "packetLossPercent": None,
            "cpuPercent": None,
            "memory": None,
            "disks": [],
            "certificates": [],
        }
    ]
