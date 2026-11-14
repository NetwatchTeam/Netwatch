"""Unit tests for MainController."""

from unittest.mock import patch

from controllers.main_controller import MainController


@patch("controllers.main_controller.scan")
def test_scan_machines_transmet_targets_au_use_case_et_au_presenter(mock_scan):
    """Forwards the targets to the use case and its result to the presenter."""
    machines = [{"ip": "10.0.0.1"}]
    snapshot = {
        "contractVersion": "1.0.0",
        "scannedAt": "2026-11-14T00:00:00+00:00",
        "devices": [],
    }
    mock_scan.return_value = machines

    with patch(
        "controllers.main_controller.SnapshotPresenter.to_snapshot",
        return_value=snapshot,
    ) as mock_presenter:
        result = MainController().scan_machines(["10.0.0.1"])

    mock_scan.assert_called_once_with(["10.0.0.1"])
    mock_presenter.assert_called_once_with(machines)
    assert result == snapshot


@patch("controllers.main_controller.scan")
def test_scan_machines_retourne_un_snapshot_complet(mock_scan):
    """Builds a full snapshot from the use case result (real presenter)."""
    mock_scan.return_value = [{"ip": "10.0.0.1"}]

    result = MainController().scan_machines(["10.0.0.1"])

    mock_scan.assert_called_once_with(["10.0.0.1"])
    assert result["contractVersion"] == "1.0.0"
    assert "scannedAt" in result
    assert result["devices"] == [
        {
            "ip": "10.0.0.1",
            "mac": None,
            "ports": [],
            "latencyMs": None,
            "packetLossPercent": None,
            "tcpChecks": [],
            "cpuPercent": None,
            "memory": None,
            "disks": [],
            "certificates": [],
        }
    ]