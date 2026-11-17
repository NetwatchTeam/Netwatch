"""Tests de l'adapteur ICMP : seule la librairie ping3 est simulée."""

from unittest.mock import patch

import pytest

from adapters.icmp_adapter import Ping3IcmpProber


def test_ping_retourne_la_latence_en_ms():
    with patch("adapters.icmp_adapter.ping", return_value=12.5) as mocked_ping:
        delay = Ping3IcmpProber().ping("127.0.0.1", timeout=1.0)

    assert delay == 12.5
    mocked_ping.assert_called_once_with("127.0.0.1", timeout=1.0, unit="ms")


def test_ping_sans_reponse_retourne_none():
    with patch("adapters.icmp_adapter.ping", return_value=None):
        assert Ping3IcmpProber().ping("127.0.0.1", timeout=1.0) is None


def test_ping_latence_nulle_n_est_pas_une_erreur():
    with patch("adapters.icmp_adapter.ping", return_value=0.0):
        assert Ping3IcmpProber().ping("127.0.0.1", timeout=1.0) == 0.0


def test_false_est_une_erreur():
    with patch("adapters.icmp_adapter.ping", return_value=False):
        with pytest.raises(RuntimeError):
            Ping3IcmpProber().ping("127.0.0.1", timeout=1.0)


def test_erreur_de_permission():
    with patch(
        "adapters.icmp_adapter.ping",
        side_effect=PermissionError("Permission refusée"),
    ):
        with pytest.raises(RuntimeError, match="127.0.0.1"):
            Ping3IcmpProber().ping("127.0.0.1", timeout=1.0)


def test_l_adapteur_implemente_l_interface():
    from usecases.ports.icmp import IcmpProber

    assert isinstance(Ping3IcmpProber(), IcmpProber)
