"""Adaptateur : collecte les métriques système d'une machine distante via paramiko.

C'est le seul module qui connaît paramiko, le transport SSH et les formats de
sortie de ``free``, ``df`` et ``vmstat``.
Il dépend du port ``SystemMetricsFetcher``, jamais des entités du domaine.
"""

import paramiko

from usecases.ports.ssh import (
    RemoteDisk,
    RemoteMemory,
    RemoteMetrics,
    SystemMetricsFetcher,
)


def _parse_free_output(output: str) -> RemoteMemory | None:
    """Analyse la sortie de `free -m` pour en extraire les métriques mémoire.

    Args:
        output: Sortie texte de la commande.

    Returns:
        Les métriques mémoire, ou None si elles sont illisibles.
    """
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("Mem:"):
            tokens = line.split()
            if len(tokens) >= 3:
                total = float(tokens[1])
                if total <= 0:
                    return None
                if len(tokens) >= 7:
                    available = float(tokens[6])
                else:
                    used = float(tokens[2])
                    available = max(0.0, total - used)
                used_pct = round((total - available) / total * 100.0, 1)
                return RemoteMemory(
                    used_percent=max(0.0, min(100.0, used_pct)),
                    total_mb=round(total, 1),
                )
    return None


def _parse_df_output(output: str) -> tuple[RemoteDisk, ...]:
    """Analyse la sortie de `df -mP` pour en extraire les métriques des disques.

    Args:
        output: Sortie texte de la commande.

    Returns:
        Les métriques de chaque disque ``/dev/...`` monté.
    """
    disks = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("Filesystem"):
            continue
        tokens = line.split()
        if len(tokens) >= 6 and tokens[0].startswith("/dev/"):
            try:
                total_mb = float(tokens[1])
                used_pct = float(tokens[4].rstrip("%"))
                disks.append(
                    RemoteDisk(
                        mountpoint=tokens[5],
                        used_percent=max(0.0, min(100.0, round(used_pct, 1))),
                        total_gb=round(total_mb / 1024.0, 1),
                    )
                )
            except (ValueError, IndexError):
                continue
    return tuple(disks)


def _parse_vmstat_output(output: str) -> float | None:
    """Analyse la sortie de `vmstat 1 2` pour calculer l'utilisation du processeur.

    Args:
        output: Sortie texte de la commande.

    Returns:
        Le pourcentage d'utilisation du processeur, ou None s'il est illisible.
    """
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if len(lines) >= 3:
        # Utiliser le second intervalle de mesure (la dernière ligne)
        tokens = lines[-1].split()
        if len(tokens) >= 15:
            try:
                idle = float(tokens[-3])
                return max(0.0, min(100.0, round(100.0 - idle, 1)))
            except (ValueError, IndexError):
                pass
    return None


class ParamikoMetricsFetcher(SystemMetricsFetcher):
    """SystemMetricsFetcher implémenté avec paramiko."""

    def fetch(
        self,
        ip: str,
        username: str,
        password: str | None,
        key_filename: str | None,
        port: int,
        timeout: float,
    ) -> RemoteMetrics:
        """Exécute ``free -m``, ``df -mP`` et ``vmstat 1 2`` sur une machine distante.

        Args:
            ip: Adresse IP de la machine cible.
            username: Nom d'utilisateur de connexion SSH.
            password: Mot de passe SSH optionnel.
            key_filename: Chemin optionnel du fichier de clé privée.
            port: Port SSH.
            timeout: Délai d'attente réseau et des commandes, en secondes.

        Returns:
            Les métriques analysées. Les métriques illisibles dans les sorties
            des commandes valent None (ou vide pour les disques).

        Raises:
            RuntimeError: Si la connexion, l'authentification, une commande ou
                l'analyse de sa sortie échoue. La connexion est toujours
                fermée.
        """
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            client.connect(
                hostname=ip,
                port=port,
                username=username,
                password=password,
                key_filename=key_filename,
                timeout=timeout,
                banner_timeout=timeout,
                auth_timeout=timeout,
            )

            outputs = []
            for command, command_timeout in (
                ("free -m", timeout),
                ("df -mP", timeout),
                ("vmstat 1 2", timeout + 2.0),
            ):
                _, stdout, _ = client.exec_command(command, timeout=command_timeout)
                outputs.append(stdout.read().decode("utf-8", errors="ignore"))

            free_out, df_out, vmstat_out = outputs
            return RemoteMetrics(
                cpu_percent=_parse_vmstat_output(vmstat_out),
                memory=_parse_free_output(free_out),
                disks=_parse_df_output(df_out),
            )
        except Exception as exc:
            raise RuntimeError(f"Collecte SSH impossible pour {ip} : {exc}") from exc
        finally:
            client.close()
