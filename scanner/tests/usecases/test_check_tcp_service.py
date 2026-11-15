import pytest

from usecases.check_tcp_service import CheckTcpService
from usecases.ports.tcp import TcpProbeResult, TcpProber


class FakeTcpProber(TcpProber):
    """Faux port TCP : retourne un résultat prédéfini."""

    def __init__(self, result=None):
        self.result = result or TcpProbeResult(
            status="open",
            checked_at="2026-11-15T00:00:00+00:00",
            duration_ms=1.5,
        )
        self.calls = []

    def probe(self, ip, port, timeout):
        self.calls.append((ip, port, timeout))
        return self.result


def test_open_port():
    prober = FakeTcpProber()

    result = CheckTcpService(prober).execute("127.0.0.1", 8000, timeout=1.0)

    assert prober.calls == [("127.0.0.1", 8000, 1.0)]
    assert result == {
        "ip": "127.0.0.1",
        "port": 8000,
        "checkedAt": "2026-11-15T00:00:00+00:00",
        "reachable": True,
        "status": "open",
        "durationMs": 1.5,
        "error": None,
    }


@pytest.mark.parametrize("status", ["timeout", "refused", "error"])
def test_network_failure(status):
    prober = FakeTcpProber(
        TcpProbeResult(
            status=status,
            checked_at="2026-11-15T00:00:00+00:00",
            duration_ms=3.0,
            error="échec réseau",
        )
    )

    result = CheckTcpService(prober).execute("127.0.0.1", 8000)

    assert result["reachable"] is False
    assert result["status"] == status
    assert result["error"] == "échec réseau"


def test_ip_est_normalisee():
    prober = FakeTcpProber()

    result = CheckTcpService(prober).execute("::0001", 443)

    assert result["ip"] == "::1"
    assert prober.calls[0][0] == "::1"


@pytest.mark.parametrize("port", [0, 65536, "443", True])
def test_invalid_port(port):
    prober = FakeTcpProber()

    with pytest.raises(ValueError):
        CheckTcpService(prober).execute("127.0.0.1", port)

    assert prober.calls == []


@pytest.mark.parametrize("timeout", [0, -1, float("inf"), float("nan")])
def test_invalid_timeout(timeout):
    prober = FakeTcpProber()

    with pytest.raises(ValueError):
        CheckTcpService(prober).execute("127.0.0.1", 8000, timeout)

    assert prober.calls == []


def test_invalid_ip():
    prober = FakeTcpProber()

    with pytest.raises(ValueError):
        CheckTcpService(prober).execute("pas-une-ip", 8000)

    assert prober.calls == []
