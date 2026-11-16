"""Unit tests for MainController."""

from unittest.mock import Mock, patch

from controllers.main_controller import MainController
from usecases.check_expected_services import CheckExpectedServices
from usecases.machine_use_case import ScanMachines


def make_controller():
    scan_machines = Mock(spec=ScanMachines)
    check_expected_services = Mock(spec=CheckExpectedServices)
    controller = MainController(scan_machines, check_expected_services)
    return controller, scan_machines, check_expected_services


def test_scan_machines_transmet_targets_au_use_case_et_au_presenter():
    """Forwards the targets to the use case and its result to the presenter."""
    controller, scan_machines, _ = make_controller()
    machines = [{"ip": "10.0.0.1"}]
    snapshot = {
        "contractVersion": "1.0.0",
        "scannedAt": "2026-11-14T00:00:00+00:00",
        "devices": [],
    }
    scan_machines.execute.return_value = machines

    with patch(
        "controllers.main_controller.SnapshotPresenter.to_snapshot",
        return_value=snapshot,
    ) as mock_presenter:
        result = controller.scan_machines(["10.0.0.1"])

    scan_machines.execute.assert_called_once_with(["10.0.0.1"])
    mock_presenter.assert_called_once_with(machines)
    assert result == snapshot


def test_scan_machines_retourne_un_snapshot_complet():
    """Builds a full snapshot from the use case result (real presenter)."""
    controller, scan_machines, _ = make_controller()
    scan_machines.execute.return_value = [{"ip": "10.0.0.1"}]

    result = controller.scan_machines(["10.0.0.1"])

    scan_machines.execute.assert_called_once_with(["10.0.0.1"])
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


def test_scan_machines_propage_les_erreurs():
    import pytest

    controller, scan_machines, _ = make_controller()
    scan_machines.execute.side_effect = RuntimeError("nmap a échoué")

    with pytest.raises(RuntimeError, match="nmap a échoué"):
        controller.scan_machines()


def test_check_tcp_services_delegue_au_use_case():
    controller, _, check_expected_services = make_controller()
    check_expected_services.execute.return_value = [{"reachable": True}]

    assert controller.check_tcp_services() == [{"reachable": True}]
    check_expected_services.execute.assert_called_once_with()
