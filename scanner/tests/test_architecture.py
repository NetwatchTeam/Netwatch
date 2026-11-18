"""Garde-fous de la clean architecture : sens des dépendances entre couches.

    lib externe -> adapter -> usecase -> entités
"""

import ast
from pathlib import Path

import pytest

SRC = Path(__file__).parent.parent / "src"


def _imported_modules(package: str) -> list[tuple[str, str]]:
    """Retourne (fichier, module importé) pour chaque import d'un paquet."""
    found = []
    for path in sorted((SRC / package).rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Import):
                found += [(str(path.relative_to(SRC)), a.name) for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                found.append((str(path.relative_to(SRC)), node.module))
    return found


def _violations(package: str, forbidden: tuple[str, ...]) -> list[str]:
    return [
        f"{file} importe {module}"
        for file, module in _imported_modules(package)
        if module.split(".")[0] in forbidden
    ]


@pytest.mark.parametrize("package", ["adapters", "presenters", "controllers", "api"])
def test_les_couches_peripheriques_ne_dependent_pas_des_entites(package):
    assert _violations(package, ("entities",)) == []


def test_les_use_cases_ne_dependent_pas_des_adapteurs():
    assert _violations("usecases", ("adapters", "presenters", "controllers", "api")) == []


def test_les_entites_ne_dependent_de_rien_d_autre():
    assert _violations(
        "entities", ("adapters", "usecases", "presenters", "controllers", "api")
    ) == []
