from abc import ABC, abstractmethod
from typing import List
from scanner.src.entities.machine import Machine

class RepositoryInterface(ABC):
    @abstractmethod
    def get_all(self) -> List[Machine]:
        pass



    @abstractmethod
    def add(self, machine: Machine) -> None:
        pass
    