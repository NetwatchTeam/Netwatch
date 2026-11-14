"""Unit and integration tests for scan_network."""

from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from entities.machine import Machine
from usecases.scan_network import scan_network


def make_host(address, up=True, mac=None):
    """Builds a fake libnmap host.

    Args:
        address: IP address of the host.
        up: Value returned by ``host.is_up()``.
        mac: MAC address of the host, or None if unknown.

    Returns:
        A MagicMock mimicking a libnmap host.
    """
    host = MagicMock()
    host.address = address
    host.is_up.return_value = up
    host.mac = mac
    return host


@pytest.fixture
def nmap():
    """Mocks NmapProcess (successful run) and NmapParser.

    Yields:
        A tuple ``(process_cls, parser_cls)`` with the two patched classes.
    """
    with patch("usecases.scan_network.NmapProcess") as process_cls, \
         patch("usecases.scan_network.NmapParser") as parser_cls:
        process_cls.return_value.run.return_value = 0
        process_cls.return_value.stdout = "<xml/>"
        parser_cls.parse.return_value.hosts = []
        yield process_cls, parser_cls


def test_scan_network_error(nmap):
    """Raises a RuntimeError containing stderr when nmap fails."""
    process_cls, _ = nmap
    process_cls.return_value.run.return_value = 1
    process_cls.return_value.stderr = "erreur fatale"

    with pytest.raises(RuntimeError, match="Le scan nmap a échoué : erreur fatale"):
        scan_network(["127.0.0.1"])


def test_scan_cible_par_defaut_localhost(nmap):
    """Scans localhost when no target is given."""
    process_cls, _ = nmap
    scan_network()
    process_cls.assert_any_call("127.0.0.1", "-sn")


def test_scan_joint_plusieurs_cibles_avec_un_espace(nmap):
    """Transmits several targets to the discovery scan, joined by a space."""
    process_cls, _ = nmap
    scan_network(["10.0.0.1", "10.0.0.2"])
    # Aucun hôte découvert : seule la phase de découverte est lancée.
    process_cls.assert_called_once_with("10.0.0.1 10.0.0.2", "-sn")


def test_scan_parse_la_sortie_de_nmap(nmap):
    """Passes the nmap stdout to NmapParser."""
    process_cls, parser_cls = nmap
    process_cls.return_value.stdout = "<nmaprun/>"
    scan_network(["127.0.0.1"])
    parser_cls.parse.assert_any_call("<nmaprun/>")


def test_scan_aucun_hote_retourne_liste_vide(nmap):
    """Returns an empty list when nmap reports no host."""
    assert scan_network(["127.0.0.1"]) == []


def test_scan_ignore_les_hotes_down(nmap):
    """Skips the hosts that are reported as down."""
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [
        make_host("10.0.0.1", up=True),
        make_host("10.0.0.2", up=False),
        make_host("10.0.0.3", up=True),
    ]

    machines = scan_network(["10.0.0.0/24"])

    assert [m.ip for m in machines] == ["10.0.0.1", "10.0.0.3"]


def test_scan_retourne_des_machines_non_persistees(nmap):
    """Returns Machine entities that are not persisted (id is None)."""
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [make_host("10.0.0.1")]

    (machine,) = scan_network(["10.0.0.1"])

    assert isinstance(machine, Machine)
    assert machine.id is None
    assert machine.ip == "10.0.0.1"


def test_scan_meme_timestamp_pour_toutes_les_machines(nmap):
    """Gives the same timezone-aware timestamp to every machine."""
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [make_host("10.0.0.1"), make_host("10.0.0.2")]

    machines = scan_network(["10.0.0.0/24"])

    stamps = {m.first_seen for m in machines} | {m.last_seen for m in machines}
    assert len(stamps) == 1
    parsed = datetime.fromisoformat(stamps.pop())
    assert parsed.tzinfo is not None  # UTC


def test_scan_mac_n_est_pas_l_adresse_ip(nmap):
    """Uses the MAC reported by nmap, never the IP address."""
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [make_host("10.0.0.1", mac="00:11:22:33:44:55")]

    (machine,) = scan_network(["10.0.0.1"])

    assert machine.mac != machine.ip
    assert machine.mac == "00:11:22:33:44:55"


def test_scan_mac_est_none_si_absente(nmap):
    """Sets the MAC to None when nmap does not report one."""
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [make_host("127.0.0.1", mac=None)]

    (machine,) = scan_network(["127.0.0.1"])

    assert machine.mac is None


FIXTURES = Path(__file__).parent.parent / "fixtures"


def test_scan_avec_un_vrai_xml_nmap():
    """Integration: real NmapParser on real XML output, only NmapProcess mocked."""
    pytest.importorskip("libnmap")
    xml = (FIXTURES / "nmap_localhost.xml").read_text()

    with patch("usecases.scan_network.NmapProcess") as process_cls:
        process_cls.return_value.run.return_value = 0
        process_cls.return_value.stdout = xml

        machines = scan_network(["127.0.0.1", "10.0.0.9"])

    assert [m.ip for m in machines] == ["127.0.0.1"]  # 10.0.0.9 is down

def test_scan_execute_decouverte_puis_scan_services(nmap):
    process_cls, parser_cls = nmap

    discovery_process = MagicMock()
    discovery_process.run.return_value = 0
    discovery_process.stdout = "discovery-xml"

    service_process = MagicMock()
    service_process.run.return_value = 0
    service_process.stdout = "services-xml"

    process_cls.side_effect = [
        discovery_process,
        service_process,
    ]

    discovery_host = make_host(
        "10.0.0.1",
        mac="00:11:22:33:44:55",
    )
    service_host = make_host("10.0.0.1")
    service_host.services = []

    discovery_report = MagicMock()
    discovery_report.hosts = [discovery_host]

    service_report = MagicMock()
    service_report.hosts = [service_host]

    parser_cls.parse.side_effect = [
        discovery_report,
        service_report,
    ]

    machines = scan_network(["10.0.0.1"])

    assert process_cls.call_count == 2
    assert process_cls.call_args_list[0].args == (
        "10.0.0.1",
        "-sn",
    )
    assert process_cls.call_args_list[1].args == (
        "10.0.0.1",
        "-sT -sV --version-light -Pn -F",
    )

    discovery_process.run.assert_called_once_with()
    service_process.run.assert_called_once_with()

    assert len(machines) == 1
    assert machines[0].ip == "10.0.0.1"
    assert machines[0].mac == "00:11:22:33:44:55"

def test_scan_services_propage_son_erreur(nmap):
    process_cls, parser_cls = nmap

    discovery_process = MagicMock()
    discovery_process.run.return_value = 0

    service_process = MagicMock()
    service_process.run.return_value = 1
    service_process.stderr = "échec services"

    process_cls.side_effect = [
        discovery_process,
        service_process,
    ]

    discovery_report = MagicMock()
    discovery_report.hosts = [make_host("10.0.0.1")]
    parser_cls.parse.return_value = discovery_report

    with pytest.raises(
        RuntimeError,
        match="Le scan des ports et services a échoué : échec services",
    ):
        scan_network(["10.0.0.1"])

    parser_cls.parse.assert_called_once_with(
        discovery_process.stdout
    )
