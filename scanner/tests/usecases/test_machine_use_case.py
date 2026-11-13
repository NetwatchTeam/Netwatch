"""Tests de l'orchestration Nmap + ICMP + TCP, sans accès réseau."""

from unittest.mock import patch

import pytest

from entities.machine import Machine
from usecases.machine_use_case import scan


@pytest.fixture(autouse=True)
def network_checks():
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
    ):
        yield icmp, tcp


@patch("usecases.machine_use_case.scan_network")
def test_scan_convertit_et_enrichit_les_machines(mock_scan_network):
    mock_scan_network.return_value = [
        Machine(
            ip="10.0.0.1",
            mac="aa:bb",
            first_seen="t1",
            last_seen="t2",
            id=3,
        )
    ]

    result = scan(["10.0.0.1"])

    assert len(result) == 1
    machine = result[0]

    assert machine["ip"] == "10.0.0.1"
    assert machine["id"] == 3
    assert machine["mac"] == "aa:bb"
    assert machine["first_seen"] == "t1"
    assert machine["last_seen"] == "t2"
    assert machine["latencyMs"] == 2.0
    assert machine["packetLossPercent"] == 0.0
    assert [
        check["port"] for check in machine["tcpChecks"]
    ] == [22, 80, 443]


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
    icmp, tcp = network_checks
    icmp.return_value = {
        "latencyMs": None,
        "packetLossPercent": 100.0,
    }

    result = scan(["10.0.0.1"])

    assert len(result) == 1
    assert result[0]["ip"] == "10.0.0.1"
    assert result[0]["ports"] == []
    assert result[0]["packetLossPercent"] == 100.0
    assert len(result[0]["tcpChecks"]) == 3
    icmp.assert_called_once_with("10.0.0.1")
    assert tcp.call_count == 3


@patch("usecases.machine_use_case.scan_network")
def test_erreur_icmp_ne_bloque_pas_tcp(
    mock_scan_network,
    network_checks,
):
    mock_scan_network.return_value = []
    icmp, tcp = network_checks
    icmp.side_effect = RuntimeError("ICMP impossible")

    result = scan(["10.0.0.1"])

    assert result[0]["icmpError"] == "ICMP impossible"
    assert result[0]["latencyMs"] is None
    assert result[0]["packetLossPercent"] is None
    assert tcp.call_count == 3


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

    assert [
        check["port"] for check in result[0]["tcpChecks"]
    ] == [22, 80, 389, 443]

    _, tcp = network_checks
    assert tcp.call_count == 4


@patch("usecases.machine_use_case.scan_network")
def test_scan_propage_les_erreurs_nmap(mock_scan_network):
    mock_scan_network.side_effect = RuntimeError("nmap a échoué")

    with pytest.raises(RuntimeError, match="nmap a échoué"):
        scan()