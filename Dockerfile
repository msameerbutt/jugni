# Jugni contributor toolchain.
# Everything the Skills and build scripts need lives in here — never on the host.
# See AGENTS.md, "The Docker-only rule".
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# System dependencies for the raw-folder Intake path (spec §2):
#  - poppler-utils   : PDF text extraction (pdftotext) for booking confirmations
#  - tesseract-ocr   : OCR for photos/screenshots of tickets
#  - libjpeg/zlib    : Pillow image decoding
#  - nodejs, npm     : `make check` parses the bundled JS and then actually
#                      runs the built app in jsdom. "It built" is not the same
#                      claim as "it works", and only one of them is useful.
#  - make, git       : tooling used from inside the container
RUN apt-get update && apt-get install -y --no-install-recommends \
        poppler-utils \
        tesseract-ocr \
        tesseract-ocr-eng \
        libjpeg62-turbo \
        zlib1g \
        nodejs \
        npm \
        make \
        git \
    && rm -rf /var/lib/apt/lists/*

# Node packages, installed globally so the repo stays free of a node_modules
# tree it otherwise has no use for:
#   jsdom         - drives the smoke test in scripts/smoke.js
#   lucide-static - icon source for `make icons` (ISC licence)
#   circle-flags  - country flag source for `make icons` (MIT licence)
#   esbuild       - bundles src/app into the single output file
#   preact + htm  - the UI runtime, ~5 KB bundled into that output
# Versions are pinned: an icon set that shifts under us would change the
# rendered app without a single source file changing.
ENV NODE_PATH=/usr/local/lib/node_modules \
    HOME=/tmp \
    npm_config_cache=/tmp/.npm
RUN npm install -g --no-fund --no-audit \
        jsdom@25 \
        lucide-static@1.33.0 \
        circle-flags@2.8.3 \
        esbuild@0.25.10 \
        preact@10.27.2 \
        htm@3.1.1 \
    && npm cache clean --force \
    && chmod -R a+rX /usr/local/lib/node_modules \
    # The install ran as root. Leaving its cache behind makes /tmp/.npm
    # root-owned, and every later npm call as the invoking user then fails.
    && rm -rf /tmp/.npm \
    # Node resolution walks up from the importing file, so a symlink at the
    # filesystem root lets esbuild find preact and htm from anywhere in the
    # bind-mounted repo without a node_modules tree inside it.
    && ln -s /usr/local/lib/node_modules /node_modules

WORKDIR /jugni

COPY requirements.txt /jugni/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# The repo itself is bind-mounted at runtime (see docker-compose.yml) so that
# raw/, trips/ and input.json land on the host filesystem normally.
CMD ["bash"]
