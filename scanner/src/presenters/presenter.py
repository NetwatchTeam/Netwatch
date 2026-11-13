"""Presenter layer: shapes use case output for the API."""

from typing import List


class MachinePresenter:
    """Formats raw data for the API.

    It works on plain dictionaries and knows nothing about the business
    entities.
    """

    @staticmethod
    def to_dict(machine_data: dict) -> dict:
        """Formats a single machine.

        Args:
            machine_data: Raw machine data as a dictionary.

        Returns:
            The machine data in the format exposed by the API.
        """
        return machine_data

    @staticmethod
    def to_list(machines_data: List[dict]) -> List[dict]:
        """Formats a list of machines.

        Args:
            machines_data: Raw machine data, one dictionary per machine.

        Returns:
            The list of machines in the format exposed by the API.
        """
        return [MachinePresenter.to_dict(m) for m in machines_data]
