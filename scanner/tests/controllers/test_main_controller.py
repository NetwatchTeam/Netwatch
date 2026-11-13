"""Tests de l'orchestration du contrôleur."""

from unittest.mock import patch

from controllers.main_controller import MainController


def test_scan_machines_transmet_targets_et_formate_le_resultat():
    machines = [{"ip": "10.0.0.1"}]
    snapshot = {
        "contractVersion": "1.0.0",
        "scannedAt": "2026-11-13T00:00:00+00:00",
        "devices": [{"ip": "10.0.0.1"}],
    }

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