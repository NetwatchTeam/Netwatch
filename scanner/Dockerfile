FROM python:3.13-slim

# nmap : découverte des machines et des services (libnmap l'appelle en ligne de commande)
RUN apt-get update \
    && apt-get install -y --no-install-recommends nmap \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirement.txt ./
RUN pip install --no-cache-dir -r requirement.txt

COPY src ./src

# Exécuté en root : nmap (-sn) et ping3 (ICMP) ont besoin des sockets bruts.
ENV SCANNER_HOST=0.0.0.0 \
    SCANNER_PORT=8080
EXPOSE 8080

CMD ["python", "src/main.py"]
