from scanner.src.repositories.machine_repository_sql_lite import SQLiteMachineRepository
from scanner.src.usecases.machine_use_case import get_all
from scanner.src.controllers.main_controller import control


def main():
    repo = SQLiteMachineRepository()
    use_case = get_all(repo)
    controller = control(use_case)
    return (controller)

if __name__ == "__main__":
    main()