from scanner.src.repositories.machine_repository_sql_lite import SQLiteMachineRepository
from scanner.src.usecases.machine_use_case import execute
from scanner.src.controllers.main_controller import control


def main():
    repo = SQLiteMachineRepository()
    use_case = execute(repo)
    controller = control(use_case)
    print(controller)


main()