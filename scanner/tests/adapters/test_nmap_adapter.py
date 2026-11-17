"""Tests de l'adapteur nmap : NmapProcess (et NmapParser) sont simulés."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from adapters.nmap_adapter import NmapScanner
from usecases.ports.network_scanner import ScannedHost, ScannedService


def make_host(address, up=True, mac=None):
    """Builds a fake libnmap host."""
    host = MagicMock()
    host.address = address
    host.is_up.return_value = up
    host.mac = mac
    return host


def make_service(port, name, state="open", tunnel=None, product="", version=""):
    """Builds a fake libnmap service."""
    svc = MagicMock()
    svc.port = port
    svc.protocol = "tcp"
    svc.state = state
    svc.service = name
    svc.service_dict = {"tunnel": tunnel, "product": product, "version": version}
    return svc


@pytest.fixture
def nmap():
    """Mocks NmapProcess (successful run) and NmapParser."""
    with patch("adapters.nmap_adapter.NmapProcess") as process_cls, \
         patch("adapters.nmap_adapter.NmapParser") as parser_cls:
        process_cls.return_value.run.return_value = 0
        process_cls.return_value.stdout = "<xml/>"
        parser_cls.parse.return_value.hosts = []
        yield process_cls, parser_cls


def test_scan_error(nmap):
    process_cls, _ = nmap
    process_cls.return_value.run.return_value = 1
    process_cls.return_value.stderr = "erreur fatale"

    with pytest.raises(RuntimeError, match="Le scan nmap a échoué : erreur fatale"):
        NmapScanner().scan_hosts(["127.0.0.1"])


def test_scan_passe_les_cibles_en_liste(nmap):
    process_cls, _ = nmap
    NmapScanner().scan_hosts(["10.0.0.1", "10.0.0.2"])
    # Aucun hôte découvert : seule la phase de découverte est lancée.
    # Une liste (et non une chaîne jointe) : libnmap supprime les espaces
    # d'une chaîne et collerait les IP ensemble.
    process_cls.assert_called_once_with(["10.0.0.1", "10.0.0.2"], "-sn")


def test_scan_parse_la_sortie_de_nmap(nmap):
    process_cls, parser_cls = nmap
    process_cls.return_value.stdout = "<nmaprun/>"
    NmapScanner().scan_hosts(["127.0.0.1"])
    parser_cls.parse.assert_any_call("<nmaprun/>")


def test_scan_aucun_hote_retourne_liste_vide(nmap):
    assert NmapScanner().scan_hosts(["127.0.0.1"]) == []


def test_scan_ignore_les_hotes_down(nmap):
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [
        make_host("10.0.0.1", up=True),
        make_host("10.0.0.2", up=False),
        make_host("10.0.0.3", up=True),
    ]

    hosts = NmapScanner().scan_hosts(["10.0.0.0/24"])

    assert [h.ip for h in hosts] == ["10.0.0.1", "10.0.0.3"]


def test_scan_mac_est_none_si_absente(nmap):
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [make_host("127.0.0.1", mac=None)]

    (host,) = NmapScanner().scan_hosts(["127.0.0.1"])

    assert host.mac is None


FIXTURES = Path(__file__).parent.parent / "fixtures"


def test_scan_avec_un_vrai_xml_nmap():
    """Integration: real NmapParser on real XML output, only NmapProcess mocked."""
    pytest.importorskip("libnmap")
    xml = (FIXTURES / "nmap_localhost.xml").read_text()

    with patch("adapters.nmap_adapter.NmapProcess") as process_cls:
        process_cls.return_value.run.return_value = 0
        process_cls.return_value.stdout = xml

        hosts = NmapScanner().scan_hosts(["127.0.0.1", "10.0.0.9"])

    assert [h.ip for h in hosts] == ["127.0.0.1"]  # 10.0.0.9 is down


def test_scan_execute_decouverte_puis_scan_services_et_traduit_en_port(nmap):
    process_cls, parser_cls = nmap

    discovery_process = MagicMock()
    discovery_process.run.return_value = 0
    discovery_process.stdout = "discovery-xml"
    service_process = MagicMock()
    service_process.run.return_value = 0
    service_process.stdout = "services-xml"
    process_cls.side_effect = [discovery_process, service_process]

    discovery_host = make_host("10.0.0.1", mac="00:11:22:33:44:55")
    discovery_host.hostnames = [{"name": "srv.local"}]
    discovery_host.vendor = "Acme"

    service_host = make_host("10.0.0.1")
    service_host.services = [
        make_service(443, "http", tunnel="ssl", product="nginx", version="1.25"),
        make_service(22, "ssh", product="OpenSSH"),
        make_service(81, "http", state="closed"),
    ]

    discovery_report = MagicMock()
    discovery_report.hosts = [discovery_host]
    service_report = MagicMock()
    service_report.hosts = [service_host]
    parser_cls.parse.side_effect = [discovery_report, service_report]

    hosts = NmapScanner().scan_hosts(["10.0.0.1"])

    assert process_cls.call_args_list[0].args == (["10.0.0.1"], "-sn")
    assert process_cls.call_args_list[1].args == (
        ["10.0.0.1"],
        "-sT -sV --version-light -Pn -F",
    )
    discovery_process.run.assert_called_once_with()
    service_process.run.assert_called_once_with()

    assert hosts == [
        ScannedHost(
            ip="10.0.0.1",
            hostname="srv.local",
            mac="00:11:22:33:44:55",
            vendor="Acme",
            services=(
                ScannedService(443, "tcp", "http", "nginx", "1.25", tls=True),
                ScannedService(22, "tcp", "ssh", "OpenSSH", None, tls=False),
            ),
        )
    ]


def test_scan_services_recoit_les_ip_en_liste(nmap):
    process_cls, parser_cls = nmap
    discovery_process = MagicMock()
    discovery_process.run.return_value = 0
    service_process = MagicMock()
    service_process.run.return_value = 0
    process_cls.side_effect = [discovery_process, service_process]

    discovery_report = MagicMock()
    discovery_report.hosts = [make_host("10.0.0.1"), make_host("10.0.0.2")]
    service_report = MagicMock()
    service_report.hosts = []
    parser_cls.parse.side_effect = [discovery_report, service_report]

    NmapScanner().scan_hosts(["10.0.0.0/24"])

    assert process_cls.call_args_list[1].args == (
        ["10.0.0.1", "10.0.0.2"],
        "-sT -sV --version-light -Pn -F",
    )


def test_scan_services_propage_son_erreur(nmap):
    process_cls, parser_cls = nmap

    discovery_process = MagicMock()
    discovery_process.run.return_value = 0
    service_process = MagicMock()
    service_process.run.return_value = 1
    service_process.stderr = "échec services"
    process_cls.side_effect = [discovery_process, service_process]

    discovery_report = MagicMock()
    discovery_report.hosts = [make_host("10.0.0.1")]
    parser_cls.parse.return_value = discovery_report

    with pytest.raises(
        RuntimeError,
        match="Le scan des ports et services a échoué : échec services",
    ):
        NmapScanner().scan_hosts(["10.0.0.1"])

    parser_cls.parse.assert_called_once_with(discovery_process.stdout)
