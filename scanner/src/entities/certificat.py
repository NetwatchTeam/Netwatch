from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Certificat:
    """Entité représentant un certificat TLS extrait d'une machine/service."""
    empreinte: str
    sujet: str
    emetteur: str
    date_debut_validite: str
    date_expiration: str
    date_observation: str = field(default_factory=_now_iso)
    identifiant_certificat: Optional[int] = None
