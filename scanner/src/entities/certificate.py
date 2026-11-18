"""Entité représentant un certificat TLS observé sur un service."""

from dataclasses import dataclass, field
from datetime import datetime, timezone


def _now_iso() -> str:
    """Retourne l'heure UTC courante au format ISO 8601.

    Returns:
        Une chaîne ISO 8601 de l'instant présent, en UTC.
    """
    return datetime.now(timezone.utc).isoformat()


@dataclass
class TLSCertificate:
    """Représente un certificat TLS extrait d'un service.

    Attributes:
        empreinte: Empreinte SHA-256 du certificat.
        sujet: Sujet du certificat (chaîne RFC 4514).
        emetteur: Émetteur du certificat (chaîne RFC 4514).
        date_debut_validite: Date ISO 8601 de début de validité.
        date_expiration: Date ISO 8601 de fin de validité.
        date_observation: Horodatage ISO 8601 UTC de l'observation.
        identifiant_certificat: Identifiant optionnel en base de données.
        est_valide: Indique si le certificat est valide, ou None s'il n'a
            pas été évalué.
        erreur_validation: Message d'erreur de validation, le cas échéant.
        port: Numéro du port depuis lequel le certificat a été lu, le cas
            échéant.
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
