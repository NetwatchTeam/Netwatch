from typing import List, Optional
from dataclasses import asdict

from usecases.scan_network import scan_network
from usecases.check_tls_use_case import check_machine_tls

TLS_PORTS = {443, 8443}  # Ports standards pour les services HTTPS

"""Détermine si une machine dispose d'un service TLS/HTTPS actif en vérifiant ses ports ouverts."""
def _has_tls_service(machine) -> bool:
    if hasattr(machine, "open_ports") and machine.open_ports:
        return any(port in TLS_PORTS for port in machine.open_ports)
    return False

"""Vérifie les machines découvertes sur le réseau et récupère les informations TLS si un service HTTPS est actif."""
def scan(targets: Optional[List[str]] = None) -> List[dict]:
    discovered = scan_network(targets)
    machines_data = []

    for machine in discovered:
        machine_dict = asdict(machine)

        # Vérification du certificat TLS uniquement si un port HTTPS est ouvert
        if _has_tls_service(machine):
            port = 443 if (machine.open_ports and 443 in machine.open_ports) else 8443
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
