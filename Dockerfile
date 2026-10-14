FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py database.py app.js style.css index.html manifest.webmanifest sw.js ./
COPY student.html student-bridge.js student-core.js student-pro.js ./
COPY vendor ./vendor
COPY icons ./icons
RUN useradd --create-home --uid 10001 blackfit && mkdir /data && chown blackfit:blackfit /data
USER blackfit
ENV DATABASE_PATH=/data/blackfit.sqlite3 COOKIE_SECURE=1
EXPOSE 8001
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--bind", "0.0.0.0:8001", "app:create_app()"]
