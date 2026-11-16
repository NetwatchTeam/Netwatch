"""Tests de l'adapteur TLS : ssl, socket et x509 sont simulés."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from adapters.tls_adapter import SslTlsCertificateReader
from usecases.ports.tls import PeerCertificate


def make_cert(valid_from, expires_at):
    cert = MagicMock()
    cert.not_valid_before_utc = valid_from
    cert.not_valid_after_utc = expires_at
    cert.fingerprint.return_value.hex.return_value = "abcdef123456"
    cert.subject.rfc4514_string.return_value = "CN=monserveur.local"
    cert.issuer.rfc4514_string.return_value = "CN=MonAutorite"
    return cert


@patch("adapters.tls_adapter.x509.load_der_x509_certificate")
@patch("adapters.tls_adapter.ssl.create_default_context")
@patch("adapters.tls_adapter.socket.create_connection")
def test_read_certificate_convertit_le_certificat(mock_socket, mock_ssl, mock_x509):
    valid_from = datetime.now(timezone.utc) - timedelta(days=30)
    expires_at = datetime.now(timezone.utc) + timedelta(days=60)
    mock_x509.return_value = make_cert(valid_from, expires_at)

    result = SslTlsCertificateReader().read_certificate("192.168.1.10", 443, 3.0)

    assert result == PeerCertificate(
        fingerprint="abcdef123456",
        subject="CN=monserveur.local",
        issuer="CN=MonAutorite",
        valid_from=valid_from,
        expires_at=expires_at,
    )
    mock_socket.assert_called_once_with(("192.168.1.10", 443), timeout=3.0)


@patch("adapters.tls_adapter.socket.create_connection")
def test_read_certificate_port_ferme_leve_runtime_error(mock_socket):
    mock_socket.side_effect = OSError("Connection refused")

    with pytest.raises(RuntimeError, match="Connection refused"):
        SslTlsCertificateReader().read_certificate("192.168.1.10", 443, 3.0)


@patch("adapters.tls_adapter.x509.load_der_x509_certificate")
@patch("adapters.tls_adapter.ssl.create_default_context")
@patch("adapters.tls_adapter.socket.create_connection")
def test_read_certificate_illisible_leve_runtime_error(mock_socket, mock_ssl, mock_x509):
    mock_x509.side_effect = ValueError("DER invalide")

    with pytest.raises(RuntimeError, match="DER invalide"):
        SslTlsCertificateReader().read_certificate("192.168.1.10", 443, 3.0)
