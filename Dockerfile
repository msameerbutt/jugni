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

# jsdom drives the smoke test in scripts/smoke.js. Installed globally so the
# repo stays free of a node_modules tree it otherwise has no use for.
ENV NODE_PATH=/usr/local/lib/node_modules
RUN npm install -g --no-fund --no-audit jsdom@25 && npm cache clean --force

WORKDIR /jugni

COPY requirements.txt /jugni/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# The repo itself is bind-mounted at runtime (see docker-compose.yml) so that
# raw/, trips/ and input.json land on the host filesystem normally.
CMD ["bash"]
