"""Port (interface) : lecture du certificat TLS présenté par un service."""

from dataclasses import dataclass
from datetime import datetime
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class PeerCertificate:
    """Un certificat tel que présenté par un service.

    Attributes:
        fingerprint: Empreinte SHA-256, en hexadécimal.
        subject: Sujet (chaîne RFC 4514).
        issuer: Émetteur (chaîne RFC 4514).
        valid_from: Début de la période de validité (avec fuseau horaire).
        expires_at: Fin de la période de validité (avec fuseau horaire).
    """

    fingerprint: str
    subject: str
    issuer: str
    valid_from: datetime
    expires_at: datetime


class TlsCertificateReader(ABC):
    """Lit le certificat d'un service TLS, sans le vérifier."""

    @abstractmethod
    def read_certificate(self, ip: str, port: int, timeout: float) -> PeerCertificate:
        """Lit le certificat.

        Args:
            ip: Adresse IP du service.
            port: Port TLS du service.
            timeout: Délai d'attente de la connexion, en secondes.

        Returns:
            Le certificat présenté par le service.

        Raises:
            RuntimeError: Si le port est fermé, expire, si la négociation
                échoue ou si le certificat ne peut pas être décodé.
        """
        ...
