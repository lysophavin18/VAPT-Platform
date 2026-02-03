# VAPT Platform - Newman Container
# Designed by VINNZz
FROM node:18-alpine

LABEL maintainer="VINNZz"
LABEL description="Newman - Postman collection runner for API testing"
LABEL version="2.0"

# Install Newman and reporters
RUN npm install -g \
    newman \
    newman-reporter-htmlextra \
    newman-reporter-json-summary && \
    npm cache clean --force

# Create working directories
WORKDIR /opt/newman

# Create directories for collections and results
RUN mkdir -p /collections /results

# Volume mounts
VOLUME ["/collections", "/results"]

# Create non-root user
RUN adduser -D -h /home/newman newman
RUN chown -R newman:newman /opt/newman /results

USER newman

ENTRYPOINT ["newman"]
CMD ["--help"]
