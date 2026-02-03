# VAPT Platform - Metasploit Container
# Designed by VINNZz
FROM metasploitframework/metasploit-framework:latest

LABEL maintainer="VINNZz"
LABEL description="Metasploit Framework - For vulnerability validation only"
LABEL version="2.0"

USER root

# Create results directory
RUN mkdir -p /results

# Volume mount for results
VOLUME ["/results"]

USER msf

ENTRYPOINT ["./msfconsole"]
CMD ["-q"]
