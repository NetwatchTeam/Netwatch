"""Présentateur du résultat d'un scan selon le contrat de l'API."""

from datetime import UTC, datetime

from presenters.machine_presenter import MachinePresenter
from usecases.responses.scan_response import ScanResponse, ThroughputResponse

CONTRACT_VERSION = "1.0.0"


def _iso(dt: datetime) -> str:
    """Convertit un datetime en chaîne ISO 8601 en UTC.

    Un datetime sans fuseau horaire est supposé être en UTC.

    Args:
        dt: Le datetime à convertir.

    Returns:
        Une représentation ISO 8601 en UTC, à la milliseconde, suffixée par « Z ».
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    dt = dt.astimezone(UTC)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _without_none(d: dict) -> dict:
    """Retire d'un dictionnaire les clés dont la valeur est None.

    Args:
        d: Le dictionnaire à filtrer.

    Returns:
        Un nouveau dictionnaire sans valeur None.
    """
    return {k: v for k, v in d.items() if v is not None}


class ScanPresenter:
    """Présentateur chargé de formater les résultats de scan selon le contrat de l'API."""

    @staticmethod
    def _throughput(x: ThroughputResponse) -> dict:
        """Formate une mesure de débit en dictionnaire.

        Args:
            x: L'instance de ThroughputResponse.

        Returns:
            La représentation du débit sous forme de dictionnaire.
        """
        return {"sourceIp": x.source_ip, "targetIp": x.target_ip, "mbps": x.mbps}

    @staticmethod
    def present(scan_result: ScanResponse) -> dict:
        """Présente le résultat du scan sous forme de dictionnaire conforme au contrat de l'API.

        Args:
            scan_result: Le ScanResponse produit par le cas d'usage.

        Returns:
            Un dictionnaire contenant le rapport de scan formaté.
        """
        return {
            "contractVersion": CONTRACT_VERSION,
            "scannedAt": _iso(scan_result.scanned_at),
            "devices": MachinePresenter.to_list(scan_result.machines),
            "throughput": [
                ScanPresenter._throughput(x) for x in scan_result.throughput
            ],
        }
