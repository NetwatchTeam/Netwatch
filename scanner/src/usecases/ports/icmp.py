"""Port (interface): ICMP echo probe."""

from abc import ABC, abstractmethod


class IcmpProber(ABC):
    """Sends ICMP echo requests."""

    @abstractmethod
    def ping(self, ip: str, timeout: float) -> float | None:
        """Sends one echo request.

        Args:
            ip: The IP address to probe.
            timeout: Time to wait for the reply, in seconds.

        Returns:
            The round-trip time in milliseconds, or None if there was no reply.

        Raises:
            RuntimeError: If the probe could not be executed.
        """
        ...
