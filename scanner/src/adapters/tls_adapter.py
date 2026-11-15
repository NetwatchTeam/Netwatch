"""Adapter: reads the TLS certificate presented by a service.

This is the only module aware of ssl, socket and the cryptography x509 API.
It depends on the ``TlsCertificateReader`` port, never on the domain entities.
"""

import socket
import ssl

from cryptography import x509
from cryptography.hazmat.primitives import hashes

from usecases.ports.tls import PeerCertificate, TlsCertificateReader


class SslTlsCertificateReader(TlsCertificateReader):
    """TlsCertificateReader implemented with ssl and cryptography."""

    def read_certificate(self, ip: str, port: int, timeout: float) -> PeerCertificate:
        """Connects to a TLS service and decodes its certificate.

        The certificate is read without being verified, so that expired or
        self-signed certificates can still be inspected.

        Args:
            ip: The target IP address.
            port: The TLS port.
            timeout: Connection timeout in seconds.

        Returns:
            The PeerCertificate presented by the service.

        Raises:
            RuntimeError: If the port is closed, times out, the TLS handshake
                fails or the certificate cannot be decoded.
        """
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

        try:
            # Établissement de la connexion TCP puis de la session TLS
            with socket.create_connection((ip, port), timeout=timeout) as sock:
                with context.wrap_socket(sock) as tls_sock:
                    der = tls_sock.getpeercert(binary_form=True)

            # Décodage du certificat X.509
            cert = x509.load_der_x509_certificate(der)

            return PeerCertificate(
                fingerprint=cert.fingerprint(hashes.SHA256()).hex(),
                subject=cert.subject.rfc4514_string(),
                issuer=cert.issuer.rfc4514_string(),
                valid_from=cert.not_valid_before_utc,
                expires_at=cert.not_valid_after_utc,
            )
        except (OSError, TypeError, ValueError) as exc:
            raise RuntimeError(str(exc)) from exc
