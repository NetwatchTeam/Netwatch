from typing import List, Optional
from dataclasses import asdict

from usecases.scan_network import scan_network
from usecases.check_tls_use_case import check_machine_tls


def scan(targets: Optional[List[str]] = None) -> List[dict]:
    """Lance le scan réseau et vérifie les certificats TLS"""
    discovered = scan_network(targets)
    machines_data = []

    # Vérification TLS
    for machine in discovered:
        machine_dict = asdict(machine)

        tls_info = check_machine_tls(machine.ip)

        if tls_info:
            machine_dict["tls_status"] = tls_info.get("status")
            machine_dict["tls_days_remaining"] = tls_info.get("days_remaining")
            machine_dict["tls_not_after"] = tls_info.get("not_after")
        else:
            machine_dict["tls_status"] = "unreachable"
            machine_dict["tls_days_remaining"] = None
            machine_dict["tls_not_after"] = None

        machines_data.append(machine_dict)

    return machines_data