from scanner.src.usecases.interfaces.repository_interface import RepositoryInterface
from scanner.src.usecases.scan_network import scan_network
from scanner.src.entities.machine import Machine


def get_all(repo: RepositoryInterface):
    return(repo.get_all())
"""
def scan_network(repo: RepositoryInterface):
    machines = scan_network()
    for i in machines:
        machine = Machine(i[0], )
    repo.add()    
"""

    




if __name__ == "__main__":
    print(scan_network())