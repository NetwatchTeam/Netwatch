VENV := .venv
BIN  := $(VENV)/bin
PY   := python3

.DEFAULT_GOAL := help
.PHONY: help venv install lint format fix test check ci clean

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-10s %s\n", $$1, $$2}'

venv: ## Crée le venv
	$(PY) -m venv $(VENV)

install: venv ## Installe les dépendances (projet + outils de dev)
	$(BIN)/pip install --upgrade pip
	$(BIN)/pip install -r requirement.txt
	$(BIN)/pip install ruff pytest pytest-cov

lint: ## Lint + vérif du format (comme la CI)
	$(BIN)/ruff check .
	$(BIN)/ruff format --check .

format: ## Formate le code
	$(BIN)/ruff format .

fix: ## Corrige automatiquement lint + format
	$(BIN)/ruff check --fix .
	$(BIN)/ruff format .

test: ## Lance les tests avec couverture
	$(BIN)/pytest --cov=. --cov-report=term-missing

check: lint test ## Lint + tests

ci: check ## Alias de check : à lancer avant chaque push

clean: ## Supprime venv et caches
	rm -rf $(VENV) .pytest_cache .ruff_cache .coverage
	find . -type d -name __pycache__ -prune -exec rm -rf {} +