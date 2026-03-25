import os

# GCS Configuration
GCS_BUCKET_NAME = "yalies-photos"
GCS_SERVICE_KEY = os.environ.get(
    "GOOGLE_APPLICATION_CREDENTIALS",
    os.path.join(os.path.dirname(__file__), "../../.config/gcloud/service-key.json"),
)

# Enhancement parameters
UPSCALE_FACTOR = 2
# 0.0 = max quality (more hallucination), 1.0 = max fidelity (closer to input)
# 0.5 is a good balance for profile photos
FIDELITY_WEIGHT = 0.9

# Model weights directory
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# Output quality
JPEG_QUALITY = 95
