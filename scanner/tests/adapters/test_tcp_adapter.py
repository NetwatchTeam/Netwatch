"""Tests de l'adapteur TCP : seul socket.create_connection est simulé."""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from adapters.tcp_adapter import SocketTcpProber


def test_port_ouvert():
    connection = MagicMock()

    with patch(
        "adapters.tcp_adapter.socket.create_connection",
        return_value=connection,
    ) as connect:
        result = SocketTcpProber().probe("127.0.0.1", 8000, timeout=1.0)

    connect.assert_called_once_with(("127.0.0.1", 8000), timeout=1.0)
    connection.__exit__.assert_called_once()

    assert result.status == "open"
    assert result.error is None
    assert result.duration_ms >= 0
    assert datetime.fromisoformat(result.checked_at).tzinfo is not None


@pytest.mark.parametrize(
    ("exception", "expected_status"),
    [
        (TimeoutError("Trop long"), "timeout"),
        (ConnectionRefusedError("Refusée"), "refused"),
        (OSError("Réseau inaccessible"), "error"),
    ],
)
def test_echec_reseau_est_retourne_et_non_leve(exception, expected_status):
    with patch(
        "adapters.tcp_adapter.socket.create_connection",
        side_effect=exception,
    ):
        result = SocketTcpProber().probe("127.0.0.1", 8000, timeout=1.0)

    assert result.status == expected_status
    assert result.error == str(exception)
