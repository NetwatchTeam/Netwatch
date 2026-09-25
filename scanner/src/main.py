from controllers.main_controller import MainController
from repositories.machine_repository_sql_lite import MariaDBMachineRepository
from api.api_ressource import create_app


def main():
    repo = MariaDBMachineRepository()
    controller = MainController(repo)
    app = create_app(controller)
    app.run(host="127.0.0.1", port=5000, debug=True)


if __name__ == "__main__":
    main()