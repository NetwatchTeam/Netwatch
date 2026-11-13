from dataclasses import dataclass
from datetime import datetime


@dataclass
class TLSCertificate:
    """Represents a TLS certificate.

    Attributes:
        port: The port number associated with the certificate.
        subject: The subject of the certificate.
        issuer: The issuer of the certificate.
        valid_from: Start date of certificate validity.
        valid_until: Expiration date of certificate validity.
        is_valid: Flag indicating if the certificate is valid.
        validation_error: Optional validation error message if invalid.
        fingerprint: Optional certificate fingerprint.
        id: Optional identifier.
    """

    port: int
    subject: str
    issuer: str
    valid_from: datetime
    valid_until: datetime
    is_valid: bool
    validation_error: str | None = None
    fingerprint: str | None = None
    id: int | None = None
