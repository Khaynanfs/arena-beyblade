# Para Hugging Face Spaces (SDK: docker) ou qualquer host com Docker
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# HF Spaces usa 7860 por padrão; outros hosts injetam PORT
ENV PORT=7860
EXPOSE 7860
CMD ["python", "server.py"]
