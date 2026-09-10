FROM python:3.12-slim

ARG DENO_VERSION=2.6.3

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip libgomp1 \
    && curl -fsSL "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip" -o /tmp/deno.zip \
    && unzip /tmp/deno.zip -d /usr/local/bin \
    && rm -f /tmp/deno.zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

ENV PROFESSOR_ASK_DATA_DIR=/data
ENV PROFESSOR_ASK_WHISPER_MODEL=small
ENV PROFESSOR_ASK_WHISPER_DEVICE=cpu
ENV PROFESSOR_ASK_WHISPER_COMPUTE_TYPE=int8

VOLUME ["/data"]
EXPOSE 43120

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "43120"]
