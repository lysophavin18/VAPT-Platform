FROM python:3.11-slim

LABEL maintainer="VAPT Platform" \
      description="SQLMap - Automatic SQL injection and database takeover tool"

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git /opt/sqlmap

WORKDIR /opt/sqlmap

# Create output directory
RUN mkdir -p /output

ENTRYPOINT ["python", "sqlmap.py"]
CMD ["--help"]
