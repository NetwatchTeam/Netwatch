"""Unit tests for the machine use case (scan_network is mocked)."""

from unittest.mock import patch

import pytest

from entities.machine import Machine
from usecases.machine_use_case import scan


@patch("usecases.machine_use_case.check_availability")
@patch("usecases.machine_use_case.check_machine_tls")
@patch("usecases.machine_use_case.scan_network")
def test_scan_convertit_les_machines_en_dict_avec_tls(mock_scan_network, mock_check_tls, mock_check_availability):
    mock_scan_network.return_value = [
        Machine(ip="10.0.0.1", mac="aa:bb", first_seen="t1", last_seen="t2", id=3, open_ports=[443])
    ]
    mock_check_availability.return_value = {"latencyMs": 1.5, "packetLossPercent": 0.0}
    mock_check_tls.return_value = {
        "ip": "10.0.0.1",
        "port": 443,
        "status": "ok",
        "not_after": "2026-12-31T23:59:59+00:00",
        "days_remaining": 42,
        "identifiant_certificat": None,
        "empreinte": "abcdef123456",
        "sujet": "CN=monserveur.local",
        "emetteur": "CN=MonAutorite",
        "date_debut_validite": "2026-01-01T00:00:00+00:00",
        "date_expiration": "2026-12-31T23:59:59+00:00",
        "date_observation": "2026-11-06T12:00:00+00:00",
        "est_valide": True,
        "erreur_validation": None,
    }

    assert scan() == [
        {
            "ip": "10.0.0.1",
            "id": 3,
            "mac": "aa:bb",
            "first_seen": "t1",
            "last_seen": "t2",
            "ports": [],
            "open_ports": [443],
            "latencyMs": 1.5,
            "packetLossPercent": 0.0,
            "certificates": [
                {
                    "port": 443,
                    "subject": "CN=monserveur.local",
                    "issuer": "CN=MonAutorite",
                    "validFrom": "2026-01-01T00:00:00+00:00",
                    "expiresAt": "2026-12-31T23:59:59+00:00",
                    "valid": True,
                    "validationError": None,
                }
            ],
        }
    ]
    mock_check_availability.assert_called_once_with("10.0.0.1")
    mock_check_tls.assert_called_once_with("10.0.0.1", port=443)


@patch("usecases.machine_use_case.check_availability")
@patch("usecases.machine_use_case.check_machine_tls")
@patch("usecases.machine_use_case.scan_network")
def test_scan_enrichit_machine_avec_tls_unreachable(mock_scan_network, mock_check_tls, mock_check_availability):
    mock_scan_network.return_value = [
        Machine(ip="10.0.0.1", mac="aa:bb", first_seen="t1", last_seen="t2", id=3, open_ports=[443])
    ]
    mock_check_availability.return_value = {"latencyMs": 1.5, "packetLossPercent": 0.0}
    mock_check_tls.return_value = {
        "ip": "10.0.0.1",
        "port": 443,
        "status": "unreachable",
        "message": "Connection refused",
    }

    assert scan() == [
        {
            "ip": "10.0.0.1",
            "id": 3,
            "mac": "aa:bb",
            "first_seen": "t1",
            "last_seen": "t2",
            "ports": [],
            "open_ports": [443],
            "latencyMs": 1.5,
            "packetLossPercent": 0.0,
            "certificates": [],
        }
    ]


@patch("usecases.machine_use_case.check_availability")
@patch("usecases.machine_use_case.check_machine_tls")
@patch("usecases.machine_use_case.scan_network")
def test_scan_poste_client_sans_port_tls_ne_declenche_pas_de_check_tls(mock_scan_network, mock_check_tls, mock_check_availability):
    mock_scan_network.return_value = [
        Machine(ip="10.0.0.2", mac="cc:dd", first_seen="t1", last_seen="t2", id=4, open_ports=[22])
    ]
    mock_check_availability.return_value = {"latencyMs": 2.0, "packetLossPercent": 0.0}

    result = scan()

    # check_machine_tls ne doit JAMAIS avoir été appelé !
    mock_check_tls.assert_not_called()
    assert result == [
        {
            "ip": "10.0.0.2",
            "id": 4,
            "mac": "cc:dd",
            "first_seen": "t1",
            "last_seen": "t2",
            "ports": [],
            "open_ports": [22],
            "latencyMs": 2.0,
            "packetLossPercent": 0.0,
            "certificates": [],
        }
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
