from typing import List, Optional
from dataclasses import asdict

from entities.certificat import Certificat
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
            tls_info = check_machine_tls(machine.ip, port=443)

            # Si le certificat a pu être lu
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
                # Échec de négociation TLS ou port inaccessible
                machine_dict["certificat"] = None
                machine_dict["tls_status"] = tls_info.get("status") if tls_info else "unreachable"
                machine_dict["tls_days_remaining"] = None
                machine_dict["tls_not_after"] = None
        else:
            # Machine sans port HTTPS
            machine_dict["certificat"] = None
            machine_dict["tls_status"] = "no_service"
            machine_dict["tls_days_remaining"] = None
            machine_dict["tls_not_after"] = None

        machines_data.append(machine_dict)

    return machines_data
