"""Tests de l'orchestration Nmap + ICMP + TCP + métriques + TLS, sans accès réseau."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from entities.machine import Machine
from usecases.machine_use_case import scan


TLS_OK = {
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


@pytest.fixture(autouse=True)
def network_checks():
    """Mocke tous les contrôles réseau pour chaque test."""
    with (
        patch(
            "usecases.machine_use_case.check_availability",
            return_value={
                "latencyMs": 2.0,
                "packetLossPercent": 0.0,
            },
        ) as icmp,
        patch(
            "usecases.machine_use_case.check_tcp_service",
            side_effect=lambda ip, port, timeout: {
                "ip": ip,
                "port": port,
                "reachable": True,
                "status": "open",
                "durationMs": 1.0,
                "checkedAt": "2026-11-13T00:00:00+00:00",
                "error": None,
            },
        ) as tcp,
        patch(
            "usecases.machine_use_case.collect_system_metrics",
            return_value={
                "cpuPercent": None,
                "memory": None,
                "disks": [],
            },
        ) as metrics,
        patch(
            "usecases.machine_use_case.check_machine_tls",
            return_value={
                "status": "unreachable",
                "message": "Connection refused",
            },
        ) as tls,
    ):
        yield SimpleNamespace(icmp=icmp, tcp=tcp, metrics=metrics, tls=tls)


@patch("usecases.machine_use_case.scan_network")
def test_scan_convertit_et_enrichit_les_machines(mock_scan_network, network_checks):
    mock_scan_network.return_value = [
        Machine(
            ip="10.0.0.1",
            mac="aa:bb",
            first_seen="t1",
            last_seen="t2",
            id=3,
        )
    ]
    network_checks.icmp.return_value = {"latencyMs": 1.5, "packetLossPercent": 0.0}
    network_checks.metrics.return_value = {
        "cpuPercent": 35.0,
        "memory": {"usedPercent": 50.0, "totalMb": 4096.0},
        "disks": [{"name": "/", "usedPercent": 45.0, "totalGb": 50.0}],
    }

    result = scan(["10.0.0.1"])

    assert len(result) == 1
    machine = result[0]

    assert machine["ip"] == "10.0.0.1"
    assert machine["id"] == 3
    assert machine["mac"] == "aa:bb"
    assert machine["first_seen"] == "t1"
    assert machine["last_seen"] == "t2"
    assert machine["latencyMs"] == 1.5
    assert machine["packetLossPercent"] == 0.0
    assert machine["cpuPercent"] == 35.0
    assert machine["memory"] == {"usedPercent": 50.0, "totalMb": 4096.0}
    assert machine["disks"] == [{"name": "/", "usedPercent": 45.0, "totalGb": 50.0}]
    assert [check["port"] for check in machine["tcpChecks"]] == [22, 80, 443]
    assert machine["certificates"] == []
    network_checks.icmp.assert_called_once_with("10.0.0.1")
    network_checks.metrics.assert_called_once_with("10.0.0.1")


@patch("usecases.machine_use_case.scan_network")
def test_scan_ajoute_le_certificat_tls_si_port_https_ouvert(
        mock_scan_network, network_checks
):
    mock_scan_network.return_value = [
        Machine(
            ip="10.0.0.1",
            mac="aa:bb",
            first_seen="t1",
            last_seen="t2",
            id=3,
            open_ports=[443],
        )
    ]
    network_checks.tls.return_value = TLS_OK

    result = scan(["10.0.0.1"])

    assert result[0]["open_ports"] == [443]
    assert result[0]["certificates"] == [
        {
            "port": 443,
            "subject": "CN=monserveur.local",
            "issuer": "CN=MonAutorite",
            "validFrom": "2026-01-01T00:00:00+00:00",
            "expiresAt": "2026-12-31T23:59:59+00:00",
            "valid": True,
            "validationError": None,
        }
    ]
    network_checks.tls.assert_called_once_with("10.0.0.1", port=443)


@patch("usecases.machine_use_case.scan_network")
def test_scan_certificat_vide_si_tls_unreachable(mock_scan_network, network_checks):
    mock_scan_network.return_value = [
        Machine(
            ip="10.0.0.1",
            mac="aa:bb",
            first_seen="t1",
            last_seen="t2",
            id=3,
            open_ports=[443],
        )
    ]
    network_checks.tls.return_value = {
        "ip": "10.0.0.1",
        "port": 443,
        "status": "unreachable",
        "message": "Connection refused",
    }

    result = scan(["10.0.0.1"])

    assert result[0]["certificates"] == []
    network_checks.tls.assert_called_once_with("10.0.0.1", port=443)
    # Le contrôle TCP et les autres mesures sont quand même faits.
    assert [check["port"] for check in result[0]["tcpChecks"]] == [22, 80, 443]


@patch("usecases.machine_use_case.scan_network")
def test_scan_poste_client_sans_port_tls_ne_declenche_pas_de_check_tls(
        mock_scan_network, network_checks
):
    mock_scan_network.return_value = [
        Machine(
            ip="10.0.0.2",
            mac="cc:dd",
            first_seen="t1",
            last_seen="t2",
            id=4,
            open_ports=[22],
        )
    ]

    result = scan(["10.0.0.2"])

    # check_machine_tls ne doit JAMAIS avoir été appelé !
    network_checks.tls.assert_not_called()
    assert result[0]["certificates"] == []


@patch("usecases.machine_use_case.scan_network")
def test_scan_utilise_le_port_8443_detecte_dans_ports(
        mock_scan_network, network_checks
):
    machine = Machine(
        ip="10.0.0.1",
        mac=None,
        first_seen="t1",
        last_seen="t2",
    )
    machine.ports = [{"port": 8443, "protocol": "tcp", "services": []}]
    mock_scan_network.return_value = [machine]
    network_checks.tls.return_value = {**TLS_OK, "port": 8443}

    result = scan(["10.0.0.1"])

    network_checks.tls.assert_called_once_with("10.0.0.1", port=8443)
    assert result[0]["certificates"][0]["port"] == 8443


@patch("usecases.machine_use_case.scan_network")
def test_scan_transmet_les_targets(mock_scan_network):
    mock_scan_network.return_value = []

    scan(["10.0.0.1"])

    mock_scan_network.assert_called_once_with(["10.0.0.1"])


@patch("usecases.machine_use_case.scan_network")
def test_ip_non_decouverte_est_quand_meme_controlee(
        mock_scan_network,
        network_checks,
):
    mock_scan_network.return_value = []
    network_checks.icmp.return_value = {
        "latencyMs": None,
        "packetLossPercent": 100.0,
    }

    result = scan(["10.0.0.1"])

    assert len(result) == 1
    assert result[0]["ip"] == "10.0.0.1"
    assert result[0]["ports"] == []
    assert result[0]["packetLossPercent"] == 100.0
    assert result[0]["certificates"] == []
    assert len(result[0]["tcpChecks"]) == 3
    network_checks.icmp.assert_called_once_with("10.0.0.1")
    network_checks.metrics.assert_called_once_with("10.0.0.1")
    assert network_checks.tcp.call_count == 3


@patch("usecases.machine_use_case.scan_network")
def test_cidr_non_decouvert_nest_pas_developpe(mock_scan_network, network_checks):
    mock_scan_network.return_value = []

    result = scan(["10.0.0.0/24"])

    assert result == []
    network_checks.icmp.assert_not_called()
    network_checks.tcp.assert_not_called()


@patch("usecases.machine_use_case.scan_network")
def test_erreur_icmp_ne_bloque_pas_les_autres_controles(
        mock_scan_network,
        network_checks,
):
    mock_scan_network.return_value = []
    network_checks.icmp.side_effect = RuntimeError("ICMP impossible")

    result = scan(["10.0.0.1"])

    assert result[0]["icmpError"] == "ICMP impossible"
    assert result[0]["latencyMs"] is None
    assert result[0]["packetLossPercent"] is None
    assert network_checks.tcp.call_count == 3
    network_checks.metrics.assert_called_once_with("10.0.0.1")


@patch("usecases.machine_use_case.scan_network")
def test_erreur_metriques_ne_bloque_pas_les_autres_controles(
        mock_scan_network,
        network_checks,
):
    mock_scan_network.return_value = []
    network_checks.metrics.side_effect = RuntimeError("métriques indisponibles")

    result = scan(["10.0.0.1"])

    assert result[0]["metricsError"] == "métriques indisponibles"
    assert result[0]["cpuPercent"] is None
    assert result[0]["memory"] is None
    assert result[0]["disks"] == []
    assert result[0]["latencyMs"] == 2.0
    assert network_checks.tcp.call_count == 3


@patch("usecases.machine_use_case.scan_network")
def test_ports_tcp_nmap_ajoutes_sans_doublon(
        mock_scan_network,
        network_checks,
):
    machine = Machine(
        ip="10.0.0.1",
        mac=None,
        first_seen="t1",
        last_seen="t2",
    )
    machine.ports = [
        {"port": 22, "protocol": "tcp", "services": []},
        {"port": 389, "protocol": "tcp", "services": []},
        {"port": 53, "protocol": "udp", "services": []},
    ]
    mock_scan_network.return_value = [machine]

    result = scan(["10.0.0.1"])

    assert [check["port"] for check in result[0]["tcpChecks"]] == [22, 80, 389, 443]
    assert network_checks.tcp.call_count == 4


@patch("usecases.machine_use_case.scan_network")
def test_scan_propage_les_erreurs_nmap(mock_scan_network):
    mock_scan_network.side_effect = RuntimeError("nmap a échoué")

    with pytest.raises(RuntimeError, match="nmap a échoué"):
        scan(["10.0.0.1"])