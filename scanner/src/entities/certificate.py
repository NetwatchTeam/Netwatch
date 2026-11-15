from dataclasses import dataclass, field
from datetime import datetime, timezone


def _now_iso() -> str:
    """Returns the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


@dataclass
class TLSCertificate:
    """Represents a TLS certificate extracted from a service.

    Attributes:
        empreinte: SHA-256 fingerprint of the certificate.
        sujet: Subject of the certificate (RFC 4514 string).
        emetteur: Issuer of the certificate (RFC 4514 string).
        date_debut_validite: ISO 8601 start date of the validity period.
        date_expiration: ISO 8601 expiration date of the validity period.
        date_observation: ISO 8601 UTC timestamp of the observation.
        identifiant_certificat: Optional database identifier.
        est_valide: Whether the certificate is valid, or None if not evaluated.
        erreur_validation: Optional validation error message if invalid.
        port: Optional port number the certificate was read from.
    """

    empreinte: str
    sujet: str
    emetteur: str
    date_debut_validite: str
    date_expiration: str
    date_observation: str = field(default_factory=_now_iso)
    identifiant_certificat: int | None = None
    est_valide: bool | None = None
    erreur_validation: str | None = None
    port: int | None = None
