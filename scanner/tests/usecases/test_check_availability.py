from unittest.mock import patch

import pytest

from usecases.check_availability import check_availability


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
    with patch(
        "usecases.check_availability.ping",
        side_effect=responses,
    ) as mocked_ping:
        result = check_availability("127.0.0.1")

    assert mocked_ping.call_count == 3
    mocked_ping.assert_called_with(
        "127.0.0.1",
        timeout=1.0,
        unit="ms",
    )

    if expected_latency is None:
        assert result["latencyMs"] is None
    else:
        assert result["latencyMs"] == pytest.approx(expected_latency)

    assert result["packetLossPercent"] == pytest.approx(expected_loss)


def test_false_est_une_erreur():
    with patch(
        "usecases.check_availability.ping",
        return_value=False,
    ):
        with pytest.raises(RuntimeError):
            check_availability("127.0.0.1")


def test_erreur_de_permission():
    with patch(
        "usecases.check_availability.ping",
        side_effect=PermissionError("Permission refusée"),
    ):
        with pytest.raises(RuntimeError):
            check_availability("127.0.0.1")


@pytest.mark.parametrize(
    "kwargs",
    [
        {"attempts": 0},
        {"timeout": 0},
    ],
)
def test_parametres_invalides(kwargs):
    with pytest.raises(ValueError):
        check_availability("127.0.0.1", **kwargs)