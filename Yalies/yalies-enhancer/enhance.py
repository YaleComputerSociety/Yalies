"""
Face enhancement module for Yalies profile pictures.

Pipeline:
    1. GFPGAN upscale (4x) with Real-ESRGAN background
    2. LaMa watermark removal using pre-computed mask
    3. Output: clean, high-res profile photo

Usage:
    # Enhance a single image
    python enhance.py --input photo.jpg --output enhanced.jpg

    # Enhance from GCS bucket
    python enhance.py --photo-ids 12345 67890 --output-dir ./output

    # Test on 5 random photos from the bucket
    python enhance.py --test
"""

import argparse
import os
import tempfile

import cv2
import numpy as np
from gfpgan import GFPGANer
from PIL import Image
from simple_lama_inpainting import SimpleLama

from config import (
    FIDELITY_WEIGHT,
    GCS_BUCKET_NAME,
    GCS_SERVICE_KEY,
    JPEG_QUALITY,
    MODELS_DIR,
    UPSCALE_FACTOR,
)

MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
WATERMARK_MASK_PATH = os.path.join(MODULE_DIR, "watermark_mask.png")


def get_gcs_client():
    from google.cloud import storage

    return storage.Client.from_service_account_json(GCS_SERVICE_KEY)


def download_photo_from_gcs(photo_id: str, dest_path: str) -> bool:
    client = get_gcs_client()
    bucket = client.bucket(GCS_BUCKET_NAME)
    blob = bucket.blob(f"{photo_id}.jpg")
    if not blob.exists():
        print(f"  Photo {photo_id}.jpg not found in bucket")
        return False
    blob.download_to_filename(dest_path)
    return True


def upload_photo_to_gcs(local_path: str, photo_id: str, suffix: str = "_enhanced") -> str:
    client = get_gcs_client()
    bucket = client.bucket(GCS_BUCKET_NAME)
    dest_name = f"{photo_id}{suffix}.jpg"
    blob = bucket.blob(dest_name)
    blob.upload_from_filename(local_path, content_type="image/jpeg")
    return f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{dest_name}"


def list_random_photo_ids(count: int = 5) -> list[str]:
    import random

    client = get_gcs_client()
    bucket = client.bucket(GCS_BUCKET_NAME)
    blobs = list(bucket.list_blobs(max_results=200))
    jpg_blobs = [b for b in blobs if b.name.endswith(".jpg") and "_enhanced" not in b.name]
    selected = random.sample(jpg_blobs, min(count, len(jpg_blobs)))
    return [b.name.replace(".jpg", "") for b in selected]


def _ensure_gfpgan_weights():
    """Download GFPGAN v1.4 weights if not present."""
    weight_path = os.path.join(MODELS_DIR, "GFPGANv1.4.pth")
    if os.path.exists(weight_path):
        return weight_path

    os.makedirs(MODELS_DIR, exist_ok=True)
    print("Downloading GFPGAN v1.4 model weights...")
    import urllib.request

    url = "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth"
    urllib.request.urlretrieve(url, weight_path)
    print(f"  Saved to {weight_path}")
    return weight_path


def _ensure_realesrgan_weights():
    """Download RealESRGAN_x2plus weights if not present."""
    weight_path = os.path.join(MODELS_DIR, "RealESRGAN_x2plus.pth")
    if os.path.exists(weight_path):
        return weight_path

    os.makedirs(MODELS_DIR, exist_ok=True)
    print("Downloading RealESRGAN_x2plus model weights...")
    import urllib.request

    url = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
    urllib.request.urlretrieve(url, weight_path)
    print(f"  Saved to {weight_path}")
    return weight_path


class EnhancePipeline:
    """Full enhancement pipeline: upscale → dewatermark → output."""

    def __init__(
        self,
        upscale: int = UPSCALE_FACTOR,
        fidelity: float = FIDELITY_WEIGHT,
        dewatermark: bool = True,
    ):
        self.upscale = upscale
        self.fidelity = fidelity
        self.dewatermark = dewatermark
        self._gfpgan = None
        self._lama = None
        self._watermark_mask = None

    def _load_gfpgan(self) -> GFPGANer:
        if self._gfpgan is None:
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer

            gfpgan_path = _ensure_gfpgan_weights()
            realesrgan_path = _ensure_realesrgan_weights()

            bg_model = RRDBNet(
                num_in_ch=3, num_out_ch=3, num_feat=64,
                num_block=23, num_grow_ch=32, scale=2,
            )
            bg_upsampler = RealESRGANer(
                scale=2, model_path=realesrgan_path, model=bg_model,
                tile=400, tile_pad=10, pre_pad=0, half=False,
            )
            self._gfpgan = GFPGANer(
                model_path=gfpgan_path, upscale=self.upscale,
                arch="clean", channel_multiplier=2, bg_upsampler=bg_upsampler,
            )
        return self._gfpgan

    def _load_lama(self) -> SimpleLama:
        if self._lama is None:
            self._lama = SimpleLama()
        return self._lama

    def _load_watermark_mask(self) -> np.ndarray | None:
        if self._watermark_mask is None:
            if os.path.exists(WATERMARK_MASK_PATH):
                self._watermark_mask = cv2.imread(WATERMARK_MASK_PATH, cv2.IMREAD_GRAYSCALE)
            else:
                print(f"  Warning: watermark mask not found at {WATERMARK_MASK_PATH}")
                return None
        return self._watermark_mask

    def _remove_watermark(self, img: np.ndarray) -> np.ndarray:
        """Remove Yale watermark using LaMa inpainting."""
        mask_100 = self._load_watermark_mask()
        if mask_100 is None:
            return img

        lama = self._load_lama()
        h, w = img.shape[:2]

        # Scale mask to match image size and dilate for coverage
        mask_scaled = cv2.resize(mask_100, (w, h), interpolation=cv2.INTER_NEAREST)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask_scaled = cv2.dilate(mask_scaled, kernel, iterations=1)

        img_pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        mask_pil = Image.fromarray(mask_scaled)

        result = lama(img_pil, mask_pil)
        return cv2.cvtColor(np.array(result), cv2.COLOR_RGB2BGR)

    def enhance(self, img: np.ndarray) -> np.ndarray:
        """Run the full pipeline on a BGR image array."""
        gfpgan = self._load_gfpgan()

        # Step 1: GFPGAN upscale with high fidelity (minimal hallucination)
        _, _, upscaled = gfpgan.enhance(
            img,
            has_aligned=False,
            only_center_face=True,
            paste_back=True,
            weight=self.fidelity,
        )

        # Step 2: Watermark removal via LaMa
        if self.dewatermark:
            upscaled = self._remove_watermark(upscaled)

        return upscaled

    def enhance_file(
        self,
        input_path: str,
        output_path: str | None = None,
    ) -> np.ndarray:
        """Enhance an image file. Optionally save result."""
        img = cv2.imread(input_path, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"Could not read image: {input_path}")

        result = self.enhance(img)

        if output_path:
            cv2.imwrite(output_path, result, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])

        return result


def enhance_from_gcs(
    photo_id: str,
    output_dir: str | None = None,
    pipeline: EnhancePipeline | None = None,
    upload: bool = False,
) -> str | None:
    """Download a photo from GCS, enhance it, optionally re-upload."""
    if pipeline is None:
        pipeline = EnhancePipeline()

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, f"{photo_id}.jpg")

        if not download_photo_from_gcs(photo_id, input_path):
            return None

        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f"{photo_id}_enhanced.jpg")
        else:
            output_path = os.path.join(tmpdir, f"{photo_id}_enhanced.jpg")

        pipeline.enhance_file(input_path, output_path)

        if upload:
            url = upload_photo_to_gcs(output_path, photo_id)
            print(f"  Uploaded: {url}")
            return url

        return output_path


def test_pipeline(count: int = 5):
    """Test the enhancement pipeline on random photos from GCS."""
    print(f"Testing enhancement on {count} random photos from gs://{GCS_BUCKET_NAME}")
    print("=" * 60)

    photo_ids = list_random_photo_ids(count)
    print(f"Selected photo IDs: {photo_ids}\n")

    output_dir = os.path.join(MODULE_DIR, "test_output", "final")
    os.makedirs(output_dir, exist_ok=True)

    print("Loading models...")
    pipeline = EnhancePipeline()
    # Force model loading upfront
    pipeline._load_gfpgan()
    pipeline._load_lama()
    print("Models loaded.\n")

    for i, photo_id in enumerate(photo_ids, 1):
        print(f"[{i}/{count}] Enhancing {photo_id}...")

        # Download original for comparison
        orig_path = os.path.join(output_dir, f"{photo_id}_original.jpg")
        download_photo_from_gcs(photo_id, orig_path)

        # Run full pipeline
        enhanced_path = enhance_from_gcs(photo_id, output_dir, pipeline=pipeline)

        if enhanced_path and os.path.exists(enhanced_path):
            orig = cv2.imread(orig_path)
            enhanced = cv2.imread(enhanced_path)
            print(f"  Original:  {orig.shape[1]}x{orig.shape[0]}")
            print(f"  Enhanced:  {enhanced.shape[1]}x{enhanced.shape[0]}")

            orig_size = os.path.getsize(orig_path) / 1024
            enhanced_size = os.path.getsize(enhanced_path) / 1024
            print(f"  File size: {orig_size:.1f}KB -> {enhanced_size:.1f}KB")
        print()

    print(f"Results saved to {output_dir}/")
    print("Compare *_original.jpg vs *_enhanced.jpg to evaluate quality.")


def main():
    parser = argparse.ArgumentParser(description="Enhance Yalies profile pictures")
    parser.add_argument("--input", "-i", help="Path to input image file")
    parser.add_argument("--output", "-o", help="Path to save enhanced image")
    parser.add_argument("--photo-ids", nargs="+", help="GCS photo IDs to enhance")
    parser.add_argument("--output-dir", default="./test_output", help="Output directory for GCS photos")
    parser.add_argument("--upload", action="store_true", help="Upload enhanced photos back to GCS")
    parser.add_argument("--test", action="store_true", help="Test on 5 random photos from GCS")
    parser.add_argument("--upscale", type=int, default=UPSCALE_FACTOR, help="Upscale factor")
    parser.add_argument("--fidelity", type=float, default=FIDELITY_WEIGHT, help="Fidelity weight 0.0 (max restore) to 1.0 (original)")
    parser.add_argument("--no-dewatermark", action="store_true", help="Skip watermark removal")

    args = parser.parse_args()

    if args.test:
        test_pipeline()
        return

    if args.input:
        output = args.output or args.input.replace(".jpg", "_enhanced.jpg")
        print(f"Enhancing {args.input}...")
        pipeline = EnhancePipeline(
            upscale=args.upscale,
            fidelity=args.fidelity,
            dewatermark=not args.no_dewatermark,
        )
        pipeline.enhance_file(args.input, output)
        print(f"Done. Saved to {output}")
        return

    if args.photo_ids:
        pipeline = EnhancePipeline(
            upscale=args.upscale,
            fidelity=args.fidelity,
            dewatermark=not args.no_dewatermark,
        )
        for pid in args.photo_ids:
            print(f"Enhancing {pid}...")
            enhance_from_gcs(pid, args.output_dir, pipeline=pipeline, upload=args.upload)
        print("Done.")
        return

    parser.print_help()


if __name__ == "__main__":
    main()
