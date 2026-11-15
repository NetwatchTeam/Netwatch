"""Adapter: sends ICMP echo requests through ping3.

This is the only module aware of the ping3 library and its return conventions.
It depends on the ``IcmpProber`` port, never on the domain entities.
"""

import logging

from ping3 import ping

from usecases.ports.icmp import IcmpProber

logger = logging.getLogger(__name__)


class Ping3IcmpProber(IcmpProber):
    """IcmpProber implemented with ping3."""

    def ping(self, ip: str, timeout: float) -> float | None:
        """Sends one ICMP echo request.

        Args:
            ip: The IP address to probe.
            timeout: Time to wait for the reply, in seconds.

        Returns:
            The round-trip time in milliseconds, or None if there was no reply.

        Raises:
            RuntimeError: If the probe could not be executed (permissions,
                network stack error, or error reported by ping3).
        """
        try:
            delay = ping(ip, timeout=timeout, unit="ms")
        except OSError as exc:
            logger.exception("Impossible d'exécuter la mesure ICMP pour %s", ip)
            raise RuntimeError(f"Erreur d'exécution ICMP pour {ip} : {exc}") from exc

        # False est une erreur, pas une latence de 0 ms.
        if delay is False:
            logger.error("ping3 a retourné une erreur pour %s", ip)
            raise RuntimeError(f"Échec de la mesure ICMP pour {ip}.")

        return delay
