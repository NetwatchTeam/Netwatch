from typing import List, Optional
from dataclasses import asdict

from entities.certificat import Certificat
from usecases.scan_network import scan_network
from usecases.check_tls_use_case import check_machine_tls

TLS_PORTS = {443, 8443}


def _has_tls_service(machine) -> bool:
    """Détermine si la machine a un service TLS/HTTPS ouvert."""
    if hasattr(machine, "open_ports") and machine.open_ports:
        return any(port in TLS_PORTS for port in machine.open_ports)
    return False


def scan(targets: Optional[List[str]] = None) -> List[dict]:
    """Lance le scan réseau et vérifie les certificats TLS uniquement pour les services hébergés."""
    discovered = scan_network(targets)
    machines_data = []

    for machine in discovered:
        machine_dict = asdict(machine)

        # On ne vérifie le certificat TLS que si un service HTTPS/TLS est ouvert
        if _has_tls_service(machine):
            tls_info = check_machine_tls(machine.ip, port=443)

            if tls_info and tls_info.get("status") in ("ok", "expired", "expiring_soon"):
                certificat = Certificat(
                    identifiant_certificat=tls_info.get("identifiant_certificat"),
                    empreinte=tls_info["empreinte"],
                    sujet=tls_info["sujet"],
                    emetteur=tls_info["emetteur"],
                    date_debut_validite=tls_info["date_debut_validite"],
                    date_expiration=tls_info["date_expiration"],
                    date_observation=tls_info["date_observation"],
                    est_valide=tls_info.get("est_valide"),
                    erreur_validation=tls_info.get("erreur_validation"),
                )
                machine_dict["certificat"] = asdict(certificat)
                machine_dict["tls_status"] = tls_info.get("status")
                machine_dict["tls_days_remaining"] = tls_info.get("days_remaining")
                machine_dict["tls_not_after"] = tls_info.get("not_after")
            else:
                machine_dict["certificat"] = None
                machine_dict["tls_status"] = tls_info.get("status") if tls_info else "unreachable"
                machine_dict["tls_days_remaining"] = None
                machine_dict["tls_not_after"] = None
        else:
            # Simple poste client sans service HTTPS
            machine_dict["certificat"] = None
            machine_dict["tls_status"] = "no_service"
            machine_dict["tls_days_remaining"] = None
            machine_dict["tls_not_after"] = None

        machines_data.append(machine_dict)

    return machines_data
