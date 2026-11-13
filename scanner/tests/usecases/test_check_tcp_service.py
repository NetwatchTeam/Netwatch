from unittest.mock import MagicMock, patch

import pytest

from usecases.check_tcp_service import check_tcp_service


def test_open_port():
    """Simule un port ouvert et vérifie le résultat."""
    connection = MagicMock()

    with patch(
        "usecases.check_tcp_service.socket.create_connection",
        return_value=connection,
    ) as connect:
        result = check_tcp_service("127.0.0.1", 8000, timeout=1.0)

    connect.assert_called_once_with(
        ("127.0.0.1", 8000),
        timeout=1.0,
    )
    connection.__exit__.assert_called_once()

    assert result["reachable"] is True
    assert result["status"] == "open"
    assert result["error"] is None
    assert result["durationMs"] >= 0
    assert result["checkedAt"]


@pytest.mark.parametrize(
    ("exception", "expected_status"),
    [
        (TimeoutError("Trop long"), "timeout"),
        (ConnectionRefusedError("Refusée"), "refused"),
        (OSError("Réseau inaccessible"), "error"),
    ],
)
def test_network_failure(exception, expected_status):
    """Simule des échecs réseau et vérifie le résultat."""
    with patch(
        "usecases.check_tcp_service.socket.create_connection",
        side_effect=exception,
    ):
        result = check_tcp_service("127.0.0.1", 8000)

    assert result["reachable"] is False
    assert result["status"] == expected_status
    assert result["error"]


@pytest.mark.parametrize("port", [0, 65536, "443", True])
def test_invalid_port(port):
    with pytest.raises(ValueError):
        check_tcp_service("127.0.0.1", port)


@pytest.mark.parametrize("timeout", [0, -1, float("inf"), float("nan")])
def test_invalid_timeout(timeout):
    with pytest.raises(ValueError):
        check_tcp_service("127.0.0.1", 8000, timeout)


def test_invalid_ip():
    """Vérifie que l'IP invalide lève une ValueError."""
    with pytest.raises(ValueError):
        check_tcp_service("pas-une-ip", 8000)