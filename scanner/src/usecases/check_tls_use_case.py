import socket
import ssl
from datetime import datetime, timezone
from typing import Optional

from cryptography import x509
from cryptography.hazmat.primitives import hashes

EXPIRING_SOON_DAYS = 30


def check_machine_tls(
    ip: str,
    port: int = 443,
    timeout: float = 3.0,
    expiring_soon_days: int = EXPIRING_SOON_DAYS,
) -> dict:
    """Récupère le certificat TLS d'une machine et extrait ses métadonnées."""
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    now = datetime.now(timezone.utc)
    date_observation = now.isoformat()

    try:
        with socket.create_connection((ip, port), timeout=timeout) as sock:
            with context.wrap_socket(sock) as tls_sock:
                der = tls_sock.getpeercert(binary_form=True)
        cert = x509.load_der_x509_certificate(der)

        empreinte = cert.fingerprint(hashes.SHA256()).hex()
        sujet = cert.subject.rfc4514_string()
        emetteur = cert.issuer.rfc4514_string()
        date_debut_validite = cert.not_valid_before_utc.isoformat()
        date_expiration = cert.not_valid_after_utc.isoformat()
        expires_at = cert.not_valid_after_utc

    except (OSError, TypeError, ValueError) as e:
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
        }

    days_left = (expires_at - now).days

    if days_left < 0:
        status = "expired"
    elif days_left <= expiring_soon_days:
        status = "expiring_soon"
    else:
        status = "ok"

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
    }
