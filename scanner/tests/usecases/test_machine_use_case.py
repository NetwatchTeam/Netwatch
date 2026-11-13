"""Unit tests for the machine use case (scan_network is mocked)."""

from unittest.mock import patch

import pytest

from entities.machine import Machine
from usecases.machine_use_case import scan


@patch("usecases.machine_use_case.scan_network")
def test_scan_convertit_les_machines_en_dict(mock_scan_network):
    """Converts Machine entities into plain dictionaries."""
    mock_scan_network.return_value = [
        Machine(ip="10.0.0.1", mac="aa:bb", first_seen="t1", last_seen="t2", id=3)
    ]

    assert scan() == [
        {"ip": "10.0.0.1", "id": 3, "mac": "aa:bb", "first_seen": "t1", "last_seen": "t2"}
    ]


@patch("usecases.machine_use_case.scan_network")
def test_scan_transmet_les_targets(mock_scan_network):
    """Forwards the targets to scan_network unchanged."""
    mock_scan_network.return_value = []
    scan(["10.0.0.1"])
    mock_scan_network.assert_called_once_with(["10.0.0.1"])


@patch("usecases.machine_use_case.scan_network")
def test_scan_sans_machine_retourne_liste_vide(mock_scan_network):
    """Returns an empty list when no machine is discovered."""
    mock_scan_network.return_value = []
    assert scan() == []


@patch("usecases.machine_use_case.scan_network")
def test_scan_propage_les_erreurs(mock_scan_network):
    """Propagates the RuntimeError raised by scan_network."""
    mock_scan_network.side_effect = RuntimeError("nmap a échoué")
    with pytest.raises(RuntimeError, match="nmap a échoué"):
        scan()
