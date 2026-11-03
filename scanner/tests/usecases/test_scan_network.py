from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from entities.machine import Machine
from usecases.scan_network import scan_network


def make_host(address, up=True):
    host = MagicMock()
    host.address = address
    host.is_up.return_value = up
    return host


@pytest.fixture
def nmap():
    """Mocke NmapProcess (run OK) et NmapParser. Retourne (process_cls, parser_cls)."""
    with patch("usecases.scan_network.NmapProcess") as process_cls, \
         patch("usecases.scan_network.NmapParser") as parser_cls:
        process_cls.return_value.run.return_value = 0
        process_cls.return_value.stdout = "<xml/>"
        parser_cls.parse.return_value.hosts = []
        yield process_cls, parser_cls


def test_scan_network_error(nmap):
    process_cls, _ = nmap
    process_cls.return_value.run.return_value = 1
    process_cls.return_value.stderr = "erreur fatale"

    with pytest.raises(RuntimeError, match="Le scan nmap a échoué : erreur fatale"):
        scan_network(["127.0.0.1"])


def test_scan_cible_par_defaut_localhost(nmap):
    process_cls, _ = nmap
    scan_network()
    process_cls.assert_called_once_with("127.0.0.1", "-sV -Pn")


def test_scan_joint_plusieurs_cibles_avec_un_espace(nmap):
    process_cls, _ = nmap
    scan_network(["10.0.0.1", "10.0.0.2"])
    process_cls.assert_called_once_with("10.0.0.1 10.0.0.2", "-sV -Pn")


def test_scan_parse_la_sortie_de_nmap(nmap):
    process_cls, parser_cls = nmap
    process_cls.return_value.stdout = "<nmaprun/>"
    scan_network(["127.0.0.1"])
    parser_cls.parse.assert_called_once_with("<nmaprun/>")


def test_scan_aucun_hote_retourne_liste_vide(nmap):
    assert scan_network(["127.0.0.1"]) == []


def test_scan_ignore_les_hotes_down(nmap):
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [
        make_host("10.0.0.1", up=True),
        make_host("10.0.0.2", up=False),
        make_host("10.0.0.3", up=True),
    ]

    machines = scan_network(["10.0.0.0/24"])

    assert [m.ip for m in machines] == ["10.0.0.1", "10.0.0.3"]


def test_scan_retourne_des_machines_non_persistees(nmap):
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [make_host("10.0.0.1")]

    (machine,) = scan_network(["10.0.0.1"])

    assert isinstance(machine, Machine)
    assert machine.id is None
    assert machine.ip == "10.0.0.1"


def test_scan_meme_timestamp_pour_toutes_les_machines(nmap):
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [make_host("10.0.0.1"), make_host("10.0.0.2")]

    machines = scan_network(["10.0.0.0/24"])

    stamps = {m.first_seen for m in machines} | {m.last_seen for m in machines}
    assert len(stamps) == 1
    parsed = datetime.fromisoformat(stamps.pop())
    assert parsed.tzinfo is not None  # UTC


@pytest.mark.xfail(
    strict=True,
    reason="Bug connu : mac=host.address au lieu de _extract_mac(host) (TODO dans le code)",
)
def test_scan_mac_n_est_pas_l_adresse_ip(nmap):
    _, parser_cls = nmap
    parser_cls.parse.return_value.hosts = [make_host("10.0.0.1")]

    (machine,) = scan_network(["10.0.0.1"])

    assert machine.mac != machine.ip


FIXTURES = Path(__file__).parent.parent / "fixtures"


def test_scan_avec_un_vrai_xml_nmap():
    """Intégration : vrai NmapParser sur une vraie sortie XML, seul NmapProcess est mocké."""
    pytest.importorskip("libnmap")
    xml = (FIXTURES / "nmap_localhost.xml").read_text()

    with patch("usecases.scan_network.NmapProcess") as process_cls:
        process_cls.return_value.run.return_value = 0
        process_cls.return_value.stdout = xml

        machines = scan_network(["127.0.0.1", "10.0.0.9"])

    assert [m.ip for m in machines] == ["127.0.0.1"]  # 10.0.0.9 est down
