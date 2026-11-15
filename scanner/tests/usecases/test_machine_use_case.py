"""Tests de l'orchestration Nmap + ICMP + TCP + métriques + TLS, sans accès réseau."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from entities.machine import Machine
from usecases.check_availability import CheckAvailability
from usecases.check_tcp_service import CheckTcpService
from usecases.check_tls_use_case import CheckMachineTls
from usecases.collect_system_metrics import CollectSystemMetrics
from usecases.machine_use_case import ScanMachines
from usecases.scan_network import ScanNetwork


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


@pytest.fixture
def deps():
    """Injecte des use cases simulés dans ScanMachines (aucun accès réseau)."""
    scan_network = Mock(spec=ScanNetwork)
    scan_network.execute.return_value = []

    icmp = Mock(spec=CheckAvailability)
    icmp.execute.return_value = {"latencyMs": 2.0, "packetLossPercent": 0.0}

    tcp = Mock(spec=CheckTcpService)
    tcp.execute.side_effect = lambda ip, port, timeout: {
        "ip": ip,
        "port": port,
        "reachable": True,
        "status": "open",
        "durationMs": 1.0,
        "checkedAt": "2026-11-13T00:00:00+00:00",
        "error": None,
    }

    metrics = Mock(spec=CollectSystemMetrics)
    metrics.execute.return_value = {"cpuPercent": None, "memory": None, "disks": []}

    tls = Mock(spec=CheckMachineTls)
    tls.execute.return_value = {
        "status": "unreachable",
        "message": "Connection refused",
    }

    return SimpleNamespace(
        scan_network=scan_network,
        icmp=icmp,
        tcp=tcp,
        metrics=metrics,
        tls=tls,
        use_case=ScanMachines(
            scan_network=scan_network,
            check_availability=icmp,
            check_tcp_service=tcp,
            check_tls=tls,
            collect_system_metrics=metrics,
        ),
    )


def test_scan_convertit_et_enrichit_les_machines(deps):
    deps.scan_network.execute.return_value = [
        Machine(
            ip="10.0.0.1",
            mac="aa:bb",
            id=3,
        )
    ]
    deps.icmp.execute.return_value = {"latencyMs": 1.5, "packetLossPercent": 0.0}
    deps.metrics.execute.return_value = {
        "cpuPercent": 35.0,
        "memory": {"usedPercent": 50.0, "totalMb": 4096.0},
        "disks": [{"name": "/", "usedPercent": 45.0, "totalGb": 50.0}],
    }

    result = deps.use_case.execute(["10.0.0.1"])

    assert len(result) == 1
    machine = result[0]

    assert machine["ip"] == "10.0.0.1"
    assert machine["id"] == 3
    assert machine["mac"] == "aa:bb"
    assert "first_seen" not in machine
    assert "last_seen" not in machine
    assert machine["latencyMs"] == 1.5
    assert machine["packetLossPercent"] == 0.0
    assert machine["cpuPercent"] == 35.0
    assert machine["memory"] == {"usedPercent": 50.0, "totalMb": 4096.0}
    assert machine["disks"] == [{"name": "/", "usedPercent": 45.0, "totalGb": 50.0}]
    assert [check["port"] for check in machine["tcpChecks"]] == [22, 80, 443]
    assert machine["certificates"] == []
    deps.icmp.execute.assert_called_once_with("10.0.0.1")
    deps.metrics.execute.assert_called_once_with("10.0.0.1")


def test_scan_ajoute_le_certificat_tls_si_port_https_ouvert(deps):
    deps.scan_network.execute.return_value = [
        Machine(
            ip="10.0.0.1",
            mac="aa:bb",
            id=3,
            open_ports=[443],
        )
    ]
    deps.tls.execute.return_value = TLS_OK

    result = deps.use_case.execute(["10.0.0.1"])

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
    deps.tls.execute.assert_called_once_with("10.0.0.1", port=443)


def test_scan_certificat_vide_si_tls_unreachable(deps):
    deps.scan_network.execute.return_value = [
        Machine(
            ip="10.0.0.1",
            mac="aa:bb",
            id=3,
            open_ports=[443],
        )
    ]
    deps.tls.execute.return_value = {
        "ip": "10.0.0.1",
        "port": 443,
        "status": "unreachable",
        "message": "Connection refused",
    }

    result = deps.use_case.execute(["10.0.0.1"])

    assert result[0]["certificates"] == []
    deps.tls.execute.assert_called_once_with("10.0.0.1", port=443)
    # Le contrôle TCP et les autres mesures sont quand même faits.
    assert [check["port"] for check in result[0]["tcpChecks"]] == [22, 80, 443]


def test_scan_poste_client_sans_port_tls_ne_declenche_pas_de_check_tls(deps):
    deps.scan_network.execute.return_value = [
        Machine(
            ip="10.0.0.2",
            mac="cc:dd",
            id=4,
            open_ports=[22],
        )
    ]

    result = deps.use_case.execute(["10.0.0.2"])

    # check_machine_tls ne doit JAMAIS avoir été appelé !
    deps.tls.execute.assert_not_called()
    assert result[0]["certificates"] == []


def test_scan_utilise_le_port_8443_detecte_dans_ports(deps):
    machine = Machine(
        ip="10.0.0.1",
        mac=None,
    )
    machine.ports = [{"port": 8443, "protocol": "tcp", "services": []}]
    deps.scan_network.execute.return_value = [machine]
    deps.tls.execute.return_value = {**TLS_OK, "port": 8443}

    result = deps.use_case.execute(["10.0.0.1"])

    deps.tls.execute.assert_called_once_with("10.0.0.1", port=8443)
    assert result[0]["certificates"][0]["port"] == 8443


def test_scan_transmet_les_targets(deps):
    deps.scan_network.execute.return_value = []

    deps.use_case.execute(["10.0.0.1"])

    deps.scan_network.execute.assert_called_once_with(["10.0.0.1"])


def test_ip_non_decouverte_est_quand_meme_controlee(deps):
    deps.scan_network.execute.return_value = []
    deps.icmp.execute.return_value = {
        "latencyMs": None,
        "packetLossPercent": 100.0,
    }

    result = deps.use_case.execute(["10.0.0.1"])

    assert len(result) == 1
    assert result[0]["ip"] == "10.0.0.1"
    assert result[0]["ports"] == []
    assert result[0]["packetLossPercent"] == 100.0
    assert result[0]["certificates"] == []
    assert len(result[0]["tcpChecks"]) == 3
    deps.icmp.execute.assert_called_once_with("10.0.0.1")
    deps.metrics.execute.assert_called_once_with("10.0.0.1")
    assert deps.tcp.execute.call_count == 3


def test_cidr_non_decouvert_nest_pas_developpe(deps):
    deps.scan_network.execute.return_value = []

    result = deps.use_case.execute(["10.0.0.0/24"])

    assert result == []
    deps.icmp.execute.assert_not_called()
    deps.tcp.execute.assert_not_called()


def test_erreur_icmp_ne_bloque_pas_les_autres_controles(deps):
    deps.scan_network.execute.return_value = []
    deps.icmp.execute.side_effect = RuntimeError("ICMP impossible")

    result = deps.use_case.execute(["10.0.0.1"])

    assert result[0]["icmpError"] == "ICMP impossible"
    assert result[0]["latencyMs"] is None
    assert result[0]["packetLossPercent"] is None
    assert deps.tcp.execute.call_count == 3
    deps.metrics.execute.assert_called_once_with("10.0.0.1")


def test_erreur_metriques_ne_bloque_pas_les_autres_controles(deps):
    deps.scan_network.execute.return_value = []
    deps.metrics.execute.side_effect = RuntimeError("métriques indisponibles")

    result = deps.use_case.execute(["10.0.0.1"])

    assert result[0]["metricsError"] == "métriques indisponibles"
    assert result[0]["cpuPercent"] is None
    assert result[0]["memory"] is None
    assert result[0]["disks"] == []
    assert result[0]["latencyMs"] == 2.0
    assert deps.tcp.execute.call_count == 3


def test_ports_tcp_nmap_ajoutes_sans_doublon(deps):
    machine = Machine(
        ip="10.0.0.1",
        mac=None,
    )
    machine.ports = [
        {"port": 22, "protocol": "tcp", "services": []},
        {"port": 389, "protocol": "tcp", "services": []},
        {"port": 53, "protocol": "udp", "services": []},
    ]
    deps.scan_network.execute.return_value = [machine]

    result = deps.use_case.execute(["10.0.0.1"])

    assert [check["port"] for check in result[0]["tcpChecks"]] == [22, 80, 389, 443]
    assert deps.tcp.execute.call_count == 4


def test_scan_propage_les_erreurs_nmap(deps):
    deps.scan_network.execute.side_effect = RuntimeError("nmap a échoué")

    with pytest.raises(RuntimeError, match="nmap a échoué"):
        deps.use_case.execute(["10.0.0.1"])