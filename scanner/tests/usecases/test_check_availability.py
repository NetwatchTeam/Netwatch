import pytest

from usecases.check_availability import CheckAvailability
from usecases.ports.icmp import IcmpProber


class FakeIcmpProber(IcmpProber):
    """Faux port ICMP : rejoue des réponses prédéfinies."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def ping(self, ip, timeout):
        self.calls.append((ip, timeout))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.mark.parametrize(
    "responses, expected_latency, expected_loss",
    [
        ([10.0, 20.0, 30.0], 20.0, 0.0),
        ([10.0, None, 20.0], 15.0, 100 / 3),
        ([None, None, None], None, 100.0),
        ([0.0, 0.0, 0.0], 0.0, 0.0),
    ],
)
def test_mesures(responses, expected_latency, expected_loss):
    prober = FakeIcmpProber(responses)

    result = CheckAvailability(prober).execute("127.0.0.1")

    assert prober.calls == [("127.0.0.1", 1.0)] * 3

    if expected_latency is None:
        assert result["latencyMs"] is None
    else:
        assert result["latencyMs"] == pytest.approx(expected_latency)

    assert result["packetLossPercent"] == pytest.approx(expected_loss)


def test_attempts_et_timeout_sont_transmis_au_port():
    prober = FakeIcmpProber([1.0, 1.0])

    CheckAvailability(prober).execute("10.0.0.1", attempts=2, timeout=0.5)

    assert prober.calls == [("10.0.0.1", 0.5)] * 2


def test_erreur_d_execution_remonte():
    prober = FakeIcmpProber([RuntimeError("ICMP impossible")])

    with pytest.raises(RuntimeError, match="ICMP impossible"):
        CheckAvailability(prober).execute("127.0.0.1")


@pytest.mark.parametrize(
    "kwargs",
    [
        {"attempts": 0},
        {"timeout": 0},
    ],
)
def test_parametres_invalides(kwargs):
    prober = FakeIcmpProber([])

    with pytest.raises(ValueError):
        CheckAvailability(prober).execute("127.0.0.1", **kwargs)

    assert prober.calls == []
