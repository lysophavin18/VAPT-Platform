# VAPT Platform - WPScan Container
# Designed by VINNZz
FROM wpscanteam/wpscan:latest

LABEL maintainer="VINNZz"
LABEL description="WPScan - WordPress Security Scanner"
LABEL version="2.0"

# Create results directory
RUN mkdir -p /results

# Volume mount for results
VOLUME ["/results"]

# WPScan is already configured with proper user in base image
ENTRYPOINT ["wpscan"]
CMD ["--help"]
