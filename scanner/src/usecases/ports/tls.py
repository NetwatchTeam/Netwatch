"""Port (interface): reading of the TLS certificate presented by a service."""

from dataclasses import dataclass
from datetime import datetime
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class PeerCertificate:
    """A certificate as presented by a service.

    Attributes:
        fingerprint: SHA-256 fingerprint, in hexadecimal.
        subject: Subject (RFC 4514 string).
        issuer: Issuer (RFC 4514 string).
        valid_from: Start of the validity period (timezone-aware).
        expires_at: End of the validity period (timezone-aware).
    """

    fingerprint: str
    subject: str
    issuer: str
    valid_from: datetime
    expires_at: datetime


class TlsCertificateReader(ABC):
    """Reads the certificate of a TLS service, without verifying it."""

    @abstractmethod
    def read_certificate(self, ip: str, port: int, timeout: float) -> PeerCertificate:
        """Reads the certificate.

        Raises:
            RuntimeError: If the port is closed, times out, the handshake
                fails or the certificate cannot be decoded.
        """
        ...
