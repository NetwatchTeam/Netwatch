"""Les ports sont de vraies interfaces : on ne peut pas les instancier,
ni instancier une implémentation incomplète."""

import pytest

from usecases.ports.icmp import IcmpProber
from usecases.ports.network_scanner import NetworkScanner
from usecases.ports.ssh import SystemMetricsFetcher
from usecases.ports.tcp import TcpProber
from usecases.ports.tls import TlsCertificateReader

PORTS = [IcmpProber, NetworkScanner, SystemMetricsFetcher, TcpProber, TlsCertificateReader]


@pytest.mark.parametrize("port", PORTS)
def test_une_interface_ne_s_instancie_pas(port):
    with pytest.raises(TypeError):
        port()


@pytest.mark.parametrize("port", PORTS)
def test_une_implementation_incomplete_ne_s_instancie_pas(port):
    class Incomplete(port):
        pass

    with pytest.raises(TypeError):
        Incomplete()
