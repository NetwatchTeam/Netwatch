"""Tests du use case ScanNetwork, avec un faux port NetworkScanner."""

import pytest

from entities.machine import Machine
from entities.port import Port
from entities.service import Service
from usecases.ports.network_scanner import (
    NetworkScanner,
    ScannedHost,
    ScannedService,
)
from usecases.scan_network import DEFAULT_TARGETS, ScanNetwork


class FakeScanner(NetworkScanner):
    """Faux port de scan : retourne des hôtes prédéfinis."""

    def __init__(self, hosts=None, error=None):
        self.hosts = hosts or []
        self.error = error
        self.calls = []

    def scan_hosts(self, targets):
        self.calls.append(targets)
        if self.error:
            raise self.error
        return self.hosts


def test_scan_cible_par_defaut_localhost():
    scanner = FakeScanner()

    ScanNetwork(scanner).execute()

    assert scanner.calls == [DEFAULT_TARGETS] == [["127.0.0.1"]]


def test_scan_transmet_les_cibles():
    scanner = FakeScanner()

    ScanNetwork(scanner).execute(["10.0.0.1", "10.0.0.2"])

    assert scanner.calls == [["10.0.0.1", "10.0.0.2"]]


def test_scan_aucun_hote_retourne_liste_vide():
    assert ScanNetwork(FakeScanner()).execute(["127.0.0.1"]) == []


def test_scan_retourne_des_machines_non_persistees():
    scanner = FakeScanner([ScannedHost(ip="10.0.0.1")])

    (machine,) = ScanNetwork(scanner).execute(["10.0.0.1"])

    assert isinstance(machine, Machine)
    assert machine.id is None
    assert machine.ip == "10.0.0.1"


def test_scan_hostname_retombe_sur_l_ip_sans_dns_inverse():
    scanner = FakeScanner(
        [
            ScannedHost(ip="10.0.0.1"),
            ScannedHost(ip="10.0.0.2", hostname="srv.local"),
        ]
    )

    machines = ScanNetwork(scanner).execute(["10.0.0.0/24"])

    assert [m.hostname for m in machines] == ["10.0.0.1", "srv.local"]


def test_scan_mac_et_vendor_proviennent_du_scanner():
    scanner = FakeScanner(
        [ScannedHost(ip="10.0.0.1", mac="00:11:22:33:44:55", vendor="Acme")]
    )

    (machine,) = ScanNetwork(scanner).execute(["10.0.0.1"])

    assert machine.mac != machine.ip
    assert machine.mac == "00:11:22:33:44:55"
    assert machine.vendor == "Acme"


def test_scan_mac_est_none_si_absente():
    (machine,) = ScanNetwork(FakeScanner([ScannedHost(ip="127.0.0.1")])).execute()

    assert machine.mac is None


def test_scan_construit_ports_et_services():
    scanner = FakeScanner(
        [
            ScannedHost(
                ip="10.0.0.1",
                services=(
                    ScannedService(22, "tcp", "ssh", "OpenSSH", "9.6"),
                    ScannedService(443, "tcp", "http", "nginx", "1.25", tls=True),
                    ScannedService(9999, "tcp"),
                ),
            )
        ]
    )

    (machine,) = ScanNetwork(scanner).execute(["10.0.0.1"])

    assert machine.ports == [
        {
            "port": 22,
            "protocol": "tcp",
            "services": [{"name": "ssh", "product": "OpenSSH", "version": "9.6"}],
        },
        {
            "port": 443,
            "protocol": "tcp",
            "services": [{"name": "http", "product": "nginx", "version": "1.25"}],
        },
        {"port": 9999, "protocol": "tcp", "services": []},
    ]
    assert machine.services == [
        Service("ssh", Port(22, "tcp"), "OpenSSH", "9.6", tls=False),
        # http sur TLS devient https
        Service("https", Port(443, "tcp"), "nginx", "1.25", tls=True),
        Service("unknown", Port(9999, "tcp"), None, None, tls=False),
    ]


def test_scan_propage_les_erreurs_du_scanner():
    scanner = FakeScanner(error=RuntimeError("nmap a échoué"))

    with pytest.raises(RuntimeError, match="nmap a échoué"):
        ScanNetwork(scanner).execute(["10.0.0.1"])
