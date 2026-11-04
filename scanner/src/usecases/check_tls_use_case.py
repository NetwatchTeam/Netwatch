import socket
import ssl
from datetime import datetime, timezone

from cryptography import x509


def check_machine_tls(ip: str, port: int = 443, timeout: float = 3.0) -> dict:
    """Récupère le certificat TLS d'une machine et calcule les jours avant expiration."""
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    try:
        with socket.create_connection((ip, port), timeout=timeout) as sock:
            with context.wrap_socket(sock) as tls_sock:
                der = tls_sock.getpeercert(binary_form=True)
        cert = x509.load_der_x509_certificate(der)
        expires_at = cert.not_valid_after_utc

    except (OSError, TypeError, ValueError) as e:
        return {"ip": ip, "port": port, "status": "unreachable", "message": str(e)}

    days_left = (expires_at - datetime.now(timezone.utc)).days

    return {
        "ip": ip,
        "port": port,
        "status": "expired" if days_left < 0 else "ok",
        "not_after": expires_at.isoformat(),
        "days_remaining": days_left,
    }