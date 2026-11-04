from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from usecases.check_tls_use_case import check_machine_tls


@patch("usecases.check_tls_use_case.x509.load_der_x509_certificate")
@patch("usecases.check_tls_use_case.ssl.create_default_context")
@patch("usecases.check_tls_use_case.socket.create_connection")
def test_check_machine_tls_ok(mock_socket, mock_ssl, mock_x509):
    future_date = datetime.now(timezone.utc) + timedelta(days=60)
    mock_cert = MagicMock()
    mock_cert.not_valid_after_utc = future_date
    mock_x509.return_value = mock_cert

    result = check_machine_tls("192.168.1.10", port=443)

    assert result["ip"] == "192.168.1.10"
    assert result["port"] == 443
    assert result["status"] == "ok"
    assert result["days_remaining"] >= 59
    assert result["not_after"] == future_date.isoformat()


@patch("usecases.check_tls_use_case.x509.load_der_x509_certificate")
@patch("usecases.check_tls_use_case.ssl.create_default_context")
@patch("usecases.check_tls_use_case.socket.create_connection")
def test_check_machine_tls_expiring_soon(mock_socket, mock_ssl, mock_x509):
    expiring_date = datetime.now(timezone.utc) + timedelta(days=10)
    mock_cert = MagicMock()
    mock_cert.not_valid_after_utc = expiring_date
    mock_x509.return_value = mock_cert

    result = check_machine_tls("192.168.1.10")

    assert result["status"] == "expiring_soon"
    assert result["days_remaining"] >= 9


@patch("usecases.check_tls_use_case.x509.load_der_x509_certificate")
@patch("usecases.check_tls_use_case.ssl.create_default_context")
@patch("usecases.check_tls_use_case.socket.create_connection")
def test_check_machine_tls_expired(mock_socket, mock_ssl, mock_x509):
    past_date = datetime.now(timezone.utc) - timedelta(days=5)
    mock_cert = MagicMock()
    mock_cert.not_valid_after_utc = past_date
    mock_x509.return_value = mock_cert

    result = check_machine_tls("192.168.1.10")

    assert result["status"] == "expired"
    assert result["days_remaining"] < 0


@patch("usecases.check_tls_use_case.socket.create_connection")
def test_check_machine_tls_unreachable(mock_socket):
    mock_socket.side_effect = OSError("Connection refused")

    result = check_machine_tls("192.168.1.10")

    assert result["ip"] == "192.168.1.10"
    assert result["port"] == 443
    assert result["status"] == "unreachable"
    assert "Connection refused" in result["message"]
