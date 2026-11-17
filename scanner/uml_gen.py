#!/usr/bin/env python3
"""
uml_gen.py - Génère un diagramme de classes Mermaid à partir d'un projet Python.

- Analyse statique via `ast` : le code du projet n'est jamais exécuté ni importé.
- Ne lit QUE les fichiers *.py (jamais .env, .db, .sql, etc.) et ignore les
  dossiers cachés (.git, .venv, .env/...), __pycache__, venv, node_modules...
- Aucune dépendance : bibliothèque standard uniquement (Python 3.10+).

Exemples :
    python uml_gen.py                          # analyse le dossier "scanner" par défaut
    python uml_gen.py scanner -o docs/uml.md   # écrit un .md avec le bloc ```mermaid
    python uml_gen.py scanner -o uml.mmd -x tests # ignore le dossier "tests" dans scanner
    python uml_gen.py --types --lang en        # types des paramètres, libellés anglais
"""
from __future__ import annotations

import argparse
import ast
import os
import re
import sys
from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path

SKIP_DIRS = {"__pycache__", "venv", "env", "node_modules", "build", "dist", "site-packages",
             "libnmap", "flask", "tests", "test"}

STDLIB = set(sys.stdlib_module_names) | {"__future__", "libnmap", "flask"}

SELF = Path(__file__).resolve()

LABELS = {
    "fr": {"new": "instancie", "call": "appelle", "use": "utilise", "impl": "implémente"},
    "en": {"new": "creates", "call": "calls", "use": "uses", "impl": "implements"},
}


# --------------------------------------------------------------------------- #
# Structures
# --------------------------------------------------------------------------- #
@dataclass
class Module:
    dotted: str
    is_pkg: bool
    namespace: str | None
    tree: ast.Module
    local: dict[str, str] = field(default_factory=dict)      # classe du fichier -> id
    symbols: dict[str, str] = field(default_factory=dict)    # nom importé -> id (projet)
    externals: dict[str, tuple[str, str]] = field(default_factory=dict)  # nom -> (paquet, symbole)
    module_node: str | None = None


@dataclass
class Node:
    id: str
    label: str
    kind: str                       # "class" | "module" | "external"
    module: Module | None
    roots: list[ast.AST]
    stereotype: str | None = None
    members: list[str] = field(default_factory=list)
    namespace: str | None = None
    bases: list[str] = field(default_factory=list)
    fields: list[tuple[str, ast.expr]] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Helpers AST -> texte Mermaid
# --------------------------------------------------------------------------- #
def mtype(expr: ast.AST) -> str:
    """Annotation Python -> type Mermaid (List[int] -> List~int~)."""
    s = ast.unparse(expr)
    for a, b in ((" | ", " or "), ("[", "~"), ("]", "~"), ('"', ""), ("'", "")):
        s = s.replace(a, b)
    return s


def deco_name(d: ast.expr) -> str:
    d = d.func if isinstance(d, ast.Call) else d
    return d.id if isinstance(d, ast.Name) else d.attr if isinstance(d, ast.Attribute) else ""


def base_name(e: ast.expr) -> str:
    if isinstance(e, ast.Subscript):
        e = e.value
    return e.id if isinstance(e, ast.Name) else e.attr if isinstance(e, ast.Attribute) else ""


def vis(name: str) -> str:
    return "-" if name.startswith("_") else "+"


def fmt_func(fn: ast.FunctionDef | ast.AsyncFunctionDef, types: bool) -> str:
    decos = {deco_name(d) for d in fn.decorator_list}
    a = fn.args
    params = []
    for arg in [*a.posonlyargs, *a.args, *a.kwonlyargs]:
        if arg.arg in ("self", "cls"):
            continue
        params.append(f"{mtype(arg.annotation)} {arg.arg}" if types and arg.annotation else arg.arg)
    mark = "*" if "abstractmethod" in decos else "$" if decos & {"staticmethod", "classmethod"} else ""
    ret = f" {mtype(fn.returns)}" if fn.returns else ""
    return f"{vis(fn.name)}{fn.name.lstrip('_')}({', '.join(params)}){mark}{ret}"


def class_attrs(cls: ast.ClassDef) -> dict[str, ast.expr | None]:
    """Attributs : champs de classe / dataclass + self.x définis dans __init__."""
    attrs: dict[str, ast.expr | None] = {}
    for st in cls.body:
        if isinstance(st, ast.AnnAssign) and isinstance(st.target, ast.Name):
            attrs.setdefault(st.target.id, st.annotation)
        elif isinstance(st, ast.Assign):
            for t in st.targets:
                if isinstance(t, ast.Name):
                    attrs.setdefault(t.id, None)
        elif isinstance(st, (ast.FunctionDef, ast.AsyncFunctionDef)) and st.name == "__init__":
            params = {x.arg: x.annotation for x in [*st.args.args, *st.args.kwonlyargs] if x.annotation}
            for n in ast.walk(st):
                if isinstance(n, ast.AnnAssign):
                    targets, value, ann = [n.target], n.value, n.annotation
                elif isinstance(n, ast.Assign):
                    targets, value, ann = n.targets, n.value, None
                else:
                    continue
                for t in targets:
                    if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) and t.value.id == "self":
                        if ann is None and isinstance(value, ast.Name):
                            ann = params.get(value.id)
                        if ann is None and isinstance(value, ast.Constant) and value.value is not None:
                            ann = ast.Name(id=type(value.value).__name__)
                        attrs.setdefault(t.attr, ann)
    return attrs


def stereotype_of(cls: ast.ClassDef, methods: list, attrs: dict) -> str | None:
    bases = {base_name(b) for b in cls.bases}
    decos = {deco_name(d) for d in cls.decorator_list}
    abstract = [m for m in methods if "abstractmethod" in {deco_name(d) for d in m.decorator_list}]
    if "Protocol" in bases or (abstract and len(abstract) == len(methods) and not attrs):
        return "interface"
    if bases & {"Enum", "IntEnum", "StrEnum", "Flag", "IntFlag"}:
        return "enumeration"
    if abstract or "ABC" in bases or any(
        k.arg == "metaclass" and base_name(k.value) == "ABCMeta" for k in cls.keywords
    ):
        return "abstract"
    if "dataclass" in decos:
        return "dataclass"
    return None


def describe_class(cls: ast.ClassDef, types: bool):
    attrs = class_attrs(cls)
    funcs = [s for s in cls.body if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef))]
    methods = [f for f in funcs if not (f.name.startswith("__") and f.name.endswith("__"))]
    members = [
        f"{vis(n)}{mtype(a) + ' ' if a else ''}{n.lstrip('_')}" for n, a in attrs.items()
    ] + [fmt_func(f, types) for f in methods]
    fields = [(n, a) for n, a in attrs.items() if a is not None]
    bases = [b for b in map(base_name, cls.bases) if b]
    return stereotype_of(cls, methods, attrs), members, bases, fields


# --------------------------------------------------------------------------- #
# Collecte, noeuds, imports
# --------------------------------------------------------------------------- #
def collect(root: Path, excludes: list[str]) -> list[Module]:
    modules: list[Module] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # dossiers cachés (.git, .venv, .env/...) et dossiers techniques ignorés
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for fname in sorted(filenames):
            if not fname.endswith(".py"):        # seuls les .py sont ouverts (jamais .env)
                continue

            if fname.startswith("test_") or fname.endswith("_test.py") or fname == "conftest.py":
                continue 
            path = Path(dirpath) / fname
            if path.resolve() == SELF:           
                continue
            rel = path.relative_to(root)
            if any(fnmatch(rel.as_posix(), p) or p in rel.parts for p in excludes):
                continue
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except (SyntaxError, UnicodeDecodeError) as exc:
                print(f"# ignoré {rel} : {exc}", file=sys.stderr)
                continue
            parts = list(rel.with_suffix("").parts)
            is_pkg = parts[-1] == "__init__"
            if is_pkg:
                parts.pop()
            if not parts:
                continue
            ns = re.sub(r"\W", "_", rel.parent.name) if rel.parent != Path(".") else None
            modules.append(Module(".".join(parts), is_pkg, ns, tree))
    return modules


def new_id(name: str, hint: str, used: set[str]) -> str:
    base = re.sub(r"\W", "_", name)
    cand = base if base not in used else f"{hint}_{base}"
    i = 2
    while cand in used:
        cand = f"{base}_{i}"
        i += 1
    used.add(cand)
    return cand


def build_nodes(modules: list[Module], types: bool, with_modules: bool) -> dict[str, Node]:
    nodes: dict[str, Node] = {}
    used: set[str] = set()
    for m in modules:
        hint = m.namespace or "root"
        for st in m.tree.body:
            if isinstance(st, ast.ClassDef):
                stereo, members, bases, fields = describe_class(st, types)
                nid = new_id(st.name, hint, used)
                nodes[nid] = Node(nid, st.name, "class", m, [st], stereo, members, m.namespace, bases, fields)
                m.local[st.name] = nid
        funcs = [s for s in m.tree.body if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef))]
        if with_modules and funcs:
            name = m.dotted.split(".")[-1]
            nid = new_id(name, hint, used)
            roots = [s for s in m.tree.body if not isinstance(s, (ast.ClassDef, ast.Import, ast.ImportFrom))]
            nodes[nid] = Node(nid, name, "module", m, roots, "module",
                              [fmt_func(f, types) for f in funcs], m.namespace)
            m.module_node = nid
    return nodes


def find_module(dotted: str, by_name: dict[str, Module]) -> Module | None:
    if dotted in by_name:
        return by_name[dotted]
    hits = [m for k, m in by_name.items()
            if k.endswith("." + dotted) or ("." in k and dotted.endswith("." + k))]
    return hits[0] if len(hits) == 1 else None


def resolve_imports(m: Module, by_name: dict[str, Module]) -> None:
    pkg = m.dotted.split(".") if m.is_pkg else m.dotted.split(".")[:-1]
    for st in ast.walk(m.tree):
        if isinstance(st, ast.ImportFrom):
            if st.level:
                keep = len(pkg) - (st.level - 1)
                if keep < 0:
                    continue
                base = ".".join(pkg[:keep] + (st.module.split(".") if st.module else []))
            else:
                base = st.module or ""
            for a in st.names:
                if a.name == "*":
                    continue
                local = a.asname or a.name
                sub = find_module(f"{base}.{a.name}" if base else a.name, by_name)
                tgt = find_module(base, by_name) if base else None
                if sub:
                    if sub.module_node:
                        m.symbols[local] = sub.module_node
                elif tgt:
                    if a.name in tgt.local:
                        m.symbols[local] = tgt.local[a.name]
                    elif tgt.module_node:
                        m.symbols[local] = tgt.module_node
                elif not st.level and base and base.split(".")[0] not in STDLIB:
                    m.externals[local] = (base.split(".")[0], a.name)
        elif isinstance(st, ast.Import):
            for a in st.names:
                top = a.name.split(".")[0]
                if top in STDLIB:
                    continue
                tgt = find_module(a.name, by_name)
                local = a.asname or top
                if tgt:
                    if tgt.module_node and a.asname:
                        m.symbols[local] = tgt.module_node
                else:
                    m.externals[local] = (top, "")


# --------------------------------------------------------------------------- #
# Relations
# --------------------------------------------------------------------------- #
def analyse(roots: list[ast.AST]) -> dict[str, str]:
    """Noms utilisés -> 'new' (appel direct) > 'call' (appel via attribut) > 'use'."""
    rank = {"use": 0, "call": 1, "new": 2}
    found: dict[str, str] = {}

    def mark(name: str, kind: str) -> None:
        if rank[kind] > rank.get(found.get(name), -1):
            found[name] = kind

    for root in roots:
        for n in ast.walk(root):
            if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load):
                mark(n.id, "use")
            elif isinstance(n, ast.Call):
                f = n.func
                if isinstance(f, ast.Name):
                    mark(f.id, "new")
                else:
                    while isinstance(f, ast.Attribute):
                        f = f.value
                    if isinstance(f, ast.Name):
                        mark(f.id, "call")
    return found


def build_edges(nodes: dict[str, Node], lang: str, external: bool):
    L = LABELS[lang]
    edges: list[tuple[str, str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    ext_nodes: dict[str, Node] = {}
    used_ids = set(nodes)

    def add(src: str, arrow: str, dst: str, label: str = "") -> None:
        if src != dst and (src, arrow, dst) not in seen:
            seen.add((src, arrow, dst))
            edges.append((src, arrow, dst, label))

    def lookup(m: Module, name: str) -> str | None:
        return m.local.get(name) or m.symbols.get(name)

    for node in list(nodes.values()):
        m, skip = node.module, set()

        for b in node.bases:                                   # héritage / réalisation
            dst = lookup(m, b)
            if dst in nodes and nodes[dst].kind == "class":
                iface = nodes[dst].stereotype == "interface"
                add(node.id, "..|>" if iface else "--|>", dst, L["impl"] if iface else "")
                skip.add(dst)

        for fname, ann in node.fields:                         # association (attribut typé)
            for n in ast.walk(ann):
                if isinstance(n, ast.Name):
                    dst = lookup(m, n.id)
                    if dst in nodes and nodes[dst].kind == "class" and dst != node.id:
                        add(node.id, "-->", dst, fname)
                        skip.add(dst)

        for name, kind in analyse(node.roots).items():         # dépendances
            dst = lookup(m, name)
            if dst in nodes:
                if dst in skip:
                    continue
                if nodes[dst].kind == "class":
                    label = L["new"] if kind == "new" else L["use"]
                else:
                    label = L["call"] if kind in ("new", "call") else L["use"]
                add(node.id, "..>", dst, label)
            elif external and name in m.externals:
                pkg, sym = m.externals[name]
                if pkg not in ext_nodes:
                    eid = new_id(pkg, "ext", used_ids)
                    ext_nodes[pkg] = Node(eid, pkg, "external", None, [], "external")
                if sym and sym not in ext_nodes[pkg].members:
                    ext_nodes[pkg].members.append(sym)
                add(node.id, "..>", ext_nodes[pkg].id)

    nodes.update({n.id: n for n in ext_nodes.values()})
    return edges


# --------------------------------------------------------------------------- #
# Rendu
# --------------------------------------------------------------------------- #
def render(nodes: dict[str, Node], edges, direction: str) -> str:
    out = ["classDiagram", f"    direction {direction}"]

    def block(n: Node, indent: int) -> list[str]:
        pad = " " * indent
        head = f"{pad}class {n.id}" + (f'["{n.label}"]' if n.label != n.id else "")
        body = ([f"<<{n.stereotype}>>"] if n.stereotype else []) + n.members
        if not body:
            return [head]
        return [head + " {", *[f"{pad}    {line}" for line in body], f"{pad}}}"]

    groups: dict[str | None, list[Node]] = {}
    for n in nodes.values():
        groups.setdefault(n.namespace, []).append(n)
    for ns, items in groups.items():
        if ns is None:
            for n in items:
                out += block(n, 4)
        else:
            out.append(f"    namespace {ns} {{")
            for n in items:
                out += block(n, 8)
            out.append("    }")
    for src, arrow, dst, label in edges:
        out.append(f"    {src} {arrow} {dst}" + (f" : {label}" if label else ""))
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main() -> None:
    p = argparse.ArgumentParser(description="Génère un diagramme de classes Mermaid depuis un projet Python.")
    
    # ICI : J'ai passé le "default" de "." à "scanner"
    p.add_argument("root", nargs="?", default="scanner", help="dossier du projet (défaut : scanner)")
    
    p.add_argument("-o", "--output", help="fichier de sortie (.md => bloc ```mermaid, sinon texte brut)")
    p.add_argument("-x", "--exclude", action="append", default=[],
                   help="dossier ou motif à ignorer, ex. -x tests -x 'scripts/*' (répétable)")
    p.add_argument("--no-modules", action="store_true", help="ne pas représenter les fichiers de fonctions")
    p.add_argument("--no-external", action="store_true", help="ne pas afficher les librairies tierces")
    p.add_argument("--types", action="store_true", help="afficher les types des paramètres")
    p.add_argument("--lang", choices=LABELS, default="fr", help="langue des libellés (défaut : fr)")
    p.add_argument("--direction", choices=["TB", "BT", "LR", "RL"], default="TB")
    args = p.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        sys.exit(f"Dossier introuvable : {root}")

    modules = collect(root, args.exclude)
    nodes = build_nodes(modules, args.types, not args.no_modules)
    by_name = {m.dotted: m for m in modules}
    for m in modules:
        resolve_imports(m, by_name)
    edges = build_edges(nodes, args.lang, not args.no_external)
    text = render(nodes, edges, args.direction)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(f"```mermaid\n{text}```\n" if out.suffix == ".md" else text, encoding="utf-8")
        print(f"Écrit : {out} ({len(nodes)} éléments, {len(edges)} relations)")
    else:
        print(text)


if __name__ == "__main__":
    main()