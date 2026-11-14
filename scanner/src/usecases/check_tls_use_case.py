import socket
import ssl
from datetime import datetime, timezone
from typing import Optional

from cryptography import x509
from cryptography.hazmat.primitives import hashes

EXPIRING_SOON_DAYS = 30  # Seuil en jours pour l'alerte d'expiration imminente


"""Interroge un service TLS/HTTPS pour récupérer son certificat et vérifier sa validité."""
def check_machine_tls(
    ip: str,
    port: int = 443,
    timeout: float = 3.0,
    expiring_soon_days: int = EXPIRING_SOON_DAYS,
) -> dict:

    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    now = datetime.now(timezone.utc)
    date_observation = now.isoformat()

    try:
        # Établissement de la connexion TCP
        with socket.create_connection((ip, port), timeout=timeout) as sock:
            with context.wrap_socket(sock) as tls_sock:
                der = tls_sock.getpeercert(binary_form=True)

        # Décodage du certificat X.509
        cert = x509.load_der_x509_certificate(der)

        empreinte = cert.fingerprint(hashes.SHA256()).hex()
        sujet = cert.subject.rfc4514_string()
        emetteur = cert.issuer.rfc4514_string()
        date_debut_validite = cert.not_valid_before_utc.isoformat()
        date_expiration = cert.not_valid_after_utc.isoformat()
        expires_at = cert.not_valid_after_utc

    except (OSError, TypeError, ValueError) as e:
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

    # Calcul du nombre de jours restants avant expiration
    days_left = (expires_at - now).days

    # Détermination du statut du certificat et de sa validité
    if days_left < 0:
        status = "expired"
        est_valide = False
        erreur_validation = "certificat expiré"
    elif days_left <= expiring_soon_days:
        status = "expiring_soon"
        est_valide = True
        erreur_validation = None
    else:
        status = "ok"
        est_valide = True
        erreur_validation = None

    return {
        "ip": ip,
        "port": port,
        "status": status,
        "not_after": date_expiration,
        "days_remaining": days_left,
        "identifiant_certificat": None,
        "empreinte": empreinte,
        "sujet": sujet,
        "emetteur": emetteur,
        "date_debut_validite": date_debut_validite,
        "date_expiration": date_expiration,
        "date_observation": date_observation,
        "est_valide": est_valide,
        "erreur_validation": erreur_validation,
    }
