from scanner.src.usecases.interfaces.repository_interface import RepositoryInterface

def execute(repo: RepositoryInterface):
    return(repo.get_all())
