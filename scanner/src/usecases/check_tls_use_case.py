"""Interroge un service TLS/HTTPS pour récupérer son certificat et vérifier sa validité."""

from dataclasses import asdict
from datetime import datetime, timezone

from entities.certificate import TLSCertificate
from usecases.ports.tls import TlsCertificateReader

EXPIRING_SOON_DAYS = 30  # Seuil en jours pour l'alerte d'expiration imminente


class CheckMachineTls:
    """Contrôle un certificat TLS à travers un port TlsCertificateReader."""

    def __init__(self, reader: TlsCertificateReader) -> None:
        self._reader = reader

    def execute(
        self,
        ip: str,
        port: int = 443,
        timeout: float = 3.0,
        expiring_soon_days: int = EXPIRING_SOON_DAYS,
    ) -> dict:
        now = datetime.now(timezone.utc)
        date_observation = now.isoformat()

        try:
            peer = self._reader.read_certificate(ip, port, timeout)
        except RuntimeError as e:
            # En cas de port fermé, timeout ou échec TLS, on renvoie une erreur
            return {
                "ip": ip,
                "port": port,
                "status": "unreachable",
                "message": str(e),
                "identifiant_certificat": None,
                "empreinte": None,
                "sujet": None,
                "emetteur": None,
                "date_debut_validite": None,
                "date_expiration": None,
                "date_observation": date_observation,
                "est_valide": False,
                "erreur_validation": str(e),
            }

        certificate = TLSCertificate(
            empreinte=peer.fingerprint,
            sujet=peer.subject,
            emetteur=peer.issuer,
            date_debut_validite=peer.valid_from.isoformat(),
            date_expiration=peer.expires_at.isoformat(),
            date_observation=date_observation,
            port=port,
        )

        # Calcul du nombre de jours restants avant expiration
        days_left = (peer.expires_at - now).days

        # Détermination du statut du certificat et de sa validité
        if days_left < 0:
            status = "expired"
            certificate.est_valide = False
            certificate.erreur_validation = "certificat expiré"
        elif days_left <= expiring_soon_days:
            status = "expiring_soon"
            certificate.est_valide = True
            certificate.erreur_validation = None
        else:
            status = "ok"
            certificate.est_valide = True
            certificate.erreur_validation = None

        return {
            "ip": ip,
            "port": port,
            "status": status,
            "not_after": certificate.date_expiration,
            "days_remaining": days_left,
            **{k: v for k, v in asdict(certificate).items() if k != "port"},
        }
