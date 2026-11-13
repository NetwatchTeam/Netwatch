"""Use case: discover machines and expose them as plain data."""

from typing import List, Optional
from dataclasses import asdict

from usecases.scan_network import scan_network
from usecases.check_tls_use_case import check_machine_tls
from usecases.check_availability import check_availability

TLS_PORTS = {443, 8443}  # Ports standards pour les services HTTPS


def _has_tls_service(machine) -> bool:
    """Détermine si une machine dispose d'un service TLS/HTTPS actif en vérifiant ses ports ouverts."""
    if hasattr(machine, "open_ports") and machine.open_ports:
        if any(port in TLS_PORTS for port in machine.open_ports):
            return True
    if hasattr(machine, "ports") and machine.ports:
        detected = [p.get("port") for p in machine.ports if isinstance(p, dict)]
        if any(port in TLS_PORTS for port in detected):
            return True
    return False


def scan(targets: Optional[List[str]] = None) -> List[dict]:
    """Runs a network scan and returns simple data structures.

    Args:
        targets: IP addresses, hostnames or CIDR ranges to scan. If omitted,
            the scanner default (localhost) is used.

    Returns:
        A list of dictionaries, one per discovered machine, with keys including
        ip, id, mac, first_seen, last_seen, ports, open_ports, latencyMs,
        packetLossPercent, and certificates.

    Raises:
        RuntimeError: If the underlying network scan fails.
    """
    discovered = scan_network(targets)
    machines_data = []

    for machine in discovered:
        machine_dict = asdict(machine)

        # Mesures de disponibilité et latence
        measurements = check_availability(machine.ip)
        machine_dict.update(measurements)

        # Vérification du certificat TLS uniquement si un port HTTPS est ouvert
        if _has_tls_service(machine):
            port = 443
            detected_ports = []
            if hasattr(machine, "open_ports") and machine.open_ports:
                detected_ports.extend(machine.open_ports)
            if hasattr(machine, "ports") and machine.ports:
                detected_ports.extend([p.get("port") for p in machine.ports if isinstance(p, dict)])

            if 443 in detected_ports:
                port = 443
            elif 8443 in detected_ports:
                port = 8443

            tls_info = check_machine_tls(machine.ip, port=port)

            # Si le certificat a pu être lu
            if tls_info and tls_info.get("status") in ("ok", "expired", "expiring_soon"):
                machine_dict["certificates"] = [
                    {
                        "port": port,
                        "subject": tls_info["sujet"],
                        "issuer": tls_info["emetteur"],
                        "validFrom": tls_info["date_debut_validite"],
                        "expiresAt": tls_info["date_expiration"],
                        "valid": tls_info["est_valide"],
                        "validationError": tls_info["erreur_validation"],
                    }
                ]
            else:
                machine_dict["certificates"] = []
        else:
            # Machine sans port HTTPS
            machine_dict["certificates"] = []

        machines_data.append(machine_dict)

    return machines_data
