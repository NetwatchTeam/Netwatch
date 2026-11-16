class MachinePresenter:
    """Formats raw machine data for the API (completely ignoring domain entities)."""

    @staticmethod
    def to_dict(machine_data: dict) -> dict:
        """Converts raw machine data dictionary.

        Args:
            machine_data: The raw machine data dictionary.

        Returns:
            The formatted machine dictionary.
        """
        return machine_data

    @staticmethod
    def to_list(machines_data: list[dict]) -> list[dict]:
        """Converts a list of raw machine dictionaries.

        Args:
            machines_data: A list of raw machine data dictionaries.

        Returns:
            A list of formatted machine dictionaries.
        """
        return [MachinePresenter.to_dict(m) for m in machines_data]
