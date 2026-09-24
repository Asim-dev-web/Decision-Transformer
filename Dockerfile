# 1. Start with a lightweight Debian-based Python Linux environment
FROM python:3.10-slim

# 2. Install the C++ build tools required by Gymnasium Box2D
RUN apt-get update && apt-get install -y swig build-essential && rm -rf /var/lib/apt/lists/*

# 3. Create a folder named /app inside the container and move into it
WORKDIR /app

# 4. Copy the requirements file into the container and install the Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy ONLY the production folders into the container (ignoring the training data)
COPY api/ api/
COPY core/ core/

# 6. Open up port 8000 so the outside world can talk to the container
EXPOSE 8000

# 7. The command that runs automatically when the container boots up
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]