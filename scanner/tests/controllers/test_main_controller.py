"""Unit tests for MainController."""

from unittest.mock import patch

from controllers.main_controller import MainController


@patch("controllers.main_controller.scan")
def test_scan_machines_transmet_targets_et_retourne_le_resultat(mock_scan):
    """Forwards the targets to the use case and returns its result."""
    mock_scan.return_value = [{"ip": "10.0.0.1"}]

    result = MainController().scan_machines(["10.0.0.1"])

    mock_scan.assert_called_once_with(["10.0.0.1"])
    assert result == [{"ip": "10.0.0.1"}]
