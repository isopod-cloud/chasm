FROM node:18-bookworm

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

RUN apt-get update \
 && apt-get install --yes --no-install-recommends \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  sudo \
  tini

# CLI installations

# AWS https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
RUN mkdir --parent /tmp/awsinstaller \
 && cd /tmp/awsinstaller \
 && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
 && unzip awscliv2.zip \
 && ./aws/install

# Azure https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-linux?pivots=apt#option-1-install-with-one-command
RUN mkdir --parent /etc/apt/keyrings \
 && curl -sLS https://packages.microsoft.com/keys/microsoft.asc \
  | gpg --dearmor > /etc/apt/keyrings/microsoft.gpg \
 && chmod a=r /etc/apt/keyrings/microsoft.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli/ $(lsb_release -cs) main" \
    > /etc/apt/sources.list.d/azure-cli.list \
 && apt-get update \
 && apt-get install --yes \
     azure-cli

# GCloud https://cloud.google.com/sdk/docs/install
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] http://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list \
 && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | apt-key --keyring /usr/share/keyrings/cloud.google.gpg add - \
 && apt-get update \
 && apt-get install --yes \
     google-cloud-cli

# Pulumi install
# TODO: pull this from package.json
ENV PULUMI_VERSION="3.76.1"
RUN curl -fsSL "https://get.pulumi.com" | sh -s -- --version "${PULUMI_VERSION}"

RUN mkdir --parent /app/pulumi \
 && cp /root/.pulumi/bin/* /app/pulumi

WORKDIR /app
COPY package.json ./package.json
COPY node_modules ./node_modules
COPY dist /app
COPY ./chasm /app

COPY ./docker-entrypoint.sh ./docker-entrypoint.sh
ENTRYPOINT ["tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "app.js"]
