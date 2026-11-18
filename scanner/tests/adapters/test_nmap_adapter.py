"""Tests de l'adapteur nmap : NmapProcess (et NmapParser) sont simulés."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from adapters.nmap_adapter import NmapScanner
from usecases.ports.network_scanner import ScannedHost, ScannedService


def make_host(address, up=True, mac=None):
    """Construit un faux hôte libnmap."""
    host = MagicMock()
    host.address = address
    host.is_up.return_value = up
    host.mac = mac
    return host


def make_service(port, name, state="open", tunnel=None, product="", version=""):
    """Construit un faux service libnmap."""
    svc = MagicMock()
    svc.port = port
    svc.protocol = "tcp"
    svc.state = state
    svc.service = name
    svc.service_dict = {"tunnel": tunnel, "product": product, "version": version}
    return svc


@pytest.fixture
def nmap():
    """Simule NmapProcess (exécution réussie) et NmapParser."""
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


def test_scan_un_run_par_cible(nmap):
    process_cls, _ = nmap
    NmapScanner().scan_hosts(["10.0.0.1", "10.0.0.0/24", "10.0.0.1"])
    # Aucun hôte découvert : seule la découverte est lancée, une fois par cible
    # (doublons ignorés). Une liste (et non une chaîne) : libnmap supprime les
    # espaces d'une chaîne.
    calls = sorted(c.args for c in process_cls.call_args_list)
    assert calls == [(["10.0.0.0/24"], "-sn"), (["10.0.0.1"], "-sn")]


def test_scan_plusieurs_plages_en_parallele_sans_doublons():
    """Chaque plage est scannée séparément ; les hôtes en chevauchement ne sont signalés qu'une fois."""
    def fake_process(targets, options):
        proc = MagicMock()
        proc.run.return_value = 0
        proc.stdout = "|".join(targets)
        return proc

    ranges = {
        "net-a": ["10.0.0.1", "10.0.0.2"],
        "net-b": ["10.0.0.2", "10.1.0.1"],
    }

    def fake_parse(stdout):
        # La sortie de découverte est le nom de la plage ; celle des services est la liste des IP.
        ips = ranges.get(stdout, stdout.split("|"))
        report = MagicMock()
        report.hosts = [make_host(ip) for ip in ips]
        return report

    with patch("adapters.nmap_adapter.NmapProcess", side_effect=fake_process), \
         patch("adapters.nmap_adapter.NmapParser") as parser_cls:
        parser_cls.parse.side_effect = fake_parse
        hosts = NmapScanner().scan_hosts(["net-a", "net-b"])

    assert [h.ip for h in hosts] == ["10.0.0.1", "10.0.0.2", "10.1.0.1"]


def test_scan_plusieurs_plages_propage_l_erreur_d_une_plage():
    def fake_process(targets, options):
        proc = MagicMock()
        proc.run.return_value = 1 if targets == ["bad"] else 0
        proc.stderr = "boom"
        proc.stdout = ""
        return proc

    with patch("adapters.nmap_adapter.NmapProcess", side_effect=fake_process), \
         patch("adapters.nmap_adapter.NmapParser") as parser_cls:
        parser_cls.parse.return_value.hosts = []
        with pytest.raises(RuntimeError, match="boom"):
            NmapScanner().scan_hosts(["good", "bad"])


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
    """Intégration : vrai NmapParser sur une vraie sortie XML, seul NmapProcess est simulé."""
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