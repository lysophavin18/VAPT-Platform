# VAPT Platform - Nmap Container
# Designed by VINNZz
FROM alpine:3.19

LABEL maintainer="VINNZz"
LABEL description="Nmap - Network exploration and security auditing"
LABEL version="2.0"

# Install nmap and required scripts
RUN apk add --no-cache \
    nmap \
    nmap-scripts \
    nmap-nselibs \
    ca-certificates

# Create working directories
WORKDIR /opt/nmap
RUN mkdir -p /results

# Create non-root user
RUN adduser -D -h /home/nmap nmap
RUN chown -R nmap:nmap /opt/nmap /results

USER nmap

VOLUME ["/results"]

ENTRYPOINT ["nmap"]
CMD ["-h"]
