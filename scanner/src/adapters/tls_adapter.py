"""Adaptateur : lit le certificat TLS présenté par un service.

C'est le seul module qui connaît ssl, socket et l'API x509 de cryptography.
Il dépend du port ``TlsCertificateReader``, jamais des entités du domaine.
"""

import socket
import ssl

from cryptography import x509
from cryptography.hazmat.primitives import hashes

from usecases.ports.tls import PeerCertificate, TlsCertificateReader


class SslTlsCertificateReader(TlsCertificateReader):
    """TlsCertificateReader implémenté avec ssl et cryptography."""

    def read_certificate(self, ip: str, port: int, timeout: float) -> PeerCertificate:
        """Se connecte à un service TLS et décode son certificat.

        Le certificat est lu sans être vérifié, afin que les certificats
        expirés ou auto-signés puissent tout de même être inspectés.

        Args:
            ip: Adresse IP cible.
            port: Port TLS.
            timeout: Délai d'attente de la connexion, en secondes.

        Returns:
            Le PeerCertificate présenté par le service.

        Raises:
            RuntimeError: Si le port est fermé, expire, si la négociation TLS
                échoue ou si le certificat ne peut pas être décodé.
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
