"""
Face detection and comparison module for Yalies.

Uses InsightFace (ArcFace) for:
    1. Face detection — is there a face in this image?
    2. Face comparison — are two faces the same person?

Usage:
    # Check if an image has a face
    python facecheck.py detect photo.jpg

    # Compare two faces
    python facecheck.py compare photo1.jpg photo2.jpg

    # As a library
    from facecheck import FaceChecker
    checker = FaceChecker()
    result = checker.detect("photo.jpg")
    match = checker.compare("photo1.jpg", "photo2.jpg")
"""

import argparse
import json
import sys
from dataclasses import dataclass

import cv2
import numpy as np
from insightface.app import FaceAnalysis


@dataclass
class DetectResult:
    has_face: bool
    num_faces: int
    confidence: float  # Highest face detection confidence (0-1)
    bbox: list | None  # [x1, y1, x2, y2] of primary face


@dataclass
class CompareResult:
    face_in_first: bool
    face_in_second: bool
    similarity: float  # Cosine similarity (-1 to 1), >0.4 typically same person
    is_match: bool  # similarity > threshold


# Cosine similarity threshold for "same person"
# 0.4 is a common default for ArcFace embeddings
MATCH_THRESHOLD = 0.4


class FaceChecker:
    def __init__(self):
        self._app = None

    def _load(self) -> FaceAnalysis:
        if self._app is None:
            self._app = FaceAnalysis(
                name="buffalo_l",
                providers=["CPUExecutionProvider"],
            )
            self._app.prepare(ctx_id=-1, det_size=(640, 640))
        return self._app

    def _read_image(self, path: str) -> np.ndarray:
        img = cv2.imread(path)
        if img is None:
            raise ValueError(f"Could not read image: {path}")
        return img

    def _get_faces(self, img: np.ndarray) -> list:
        app = self._load()
        return app.get(img)

    def detect(self, image_path: str) -> DetectResult:
        """Detect faces in an image."""
        img = self._read_image(image_path)
        faces = self._get_faces(img)

        if not faces:
            return DetectResult(has_face=False, num_faces=0, confidence=0.0, bbox=None)

        # Sort by confidence, take the best
        best = max(faces, key=lambda f: f.det_score)
        return DetectResult(
            has_face=True,
            num_faces=len(faces),
            confidence=float(best.det_score),
            bbox=best.bbox.tolist(),
        )

    def detect_image(self, img: np.ndarray) -> DetectResult:
        """Detect faces in a BGR numpy array."""
        faces = self._get_faces(img)

        if not faces:
            return DetectResult(has_face=False, num_faces=0, confidence=0.0, bbox=None)

        best = max(faces, key=lambda f: f.det_score)
        return DetectResult(
            has_face=True,
            num_faces=len(faces),
            confidence=float(best.det_score),
            bbox=best.bbox.tolist(),
        )

    def get_embedding(self, image_path: str) -> np.ndarray | None:
        """Get the face embedding vector for the primary face in an image."""
        img = self._read_image(image_path)
        faces = self._get_faces(img)
        if not faces:
            return None
        best = max(faces, key=lambda f: f.det_score)
        return best.normed_embedding

    def get_embedding_from_image(self, img: np.ndarray) -> np.ndarray | None:
        """Get face embedding from a BGR numpy array."""
        faces = self._get_faces(img)
        if not faces:
            return None
        best = max(faces, key=lambda f: f.det_score)
        return best.normed_embedding

    def compare(
        self,
        image_path_1: str,
        image_path_2: str,
        threshold: float = MATCH_THRESHOLD,
    ) -> CompareResult:
        """Compare faces in two images."""
        emb1 = self.get_embedding(image_path_1)
        emb2 = self.get_embedding(image_path_2)

        face_in_first = emb1 is not None
        face_in_second = emb2 is not None

        if not face_in_first or not face_in_second:
            return CompareResult(
                face_in_first=face_in_first,
                face_in_second=face_in_second,
                similarity=0.0,
                is_match=False,
            )

        similarity = float(np.dot(emb1, emb2))
        return CompareResult(
            face_in_first=True,
            face_in_second=True,
            similarity=similarity,
            is_match=similarity >= threshold,
        )

    def compare_embeddings(
        self,
        emb1: np.ndarray,
        emb2: np.ndarray,
        threshold: float = MATCH_THRESHOLD,
    ) -> tuple[float, bool]:
        """Compare two pre-computed embeddings. Returns (similarity, is_match)."""
        similarity = float(np.dot(emb1, emb2))
        return similarity, similarity >= threshold


def main():
    parser = argparse.ArgumentParser(description="Face detection and comparison")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    subparsers = parser.add_subparsers(dest="command")

    detect_parser = subparsers.add_parser("detect", help="Detect faces in an image")
    detect_parser.add_argument("image", help="Path to image")

    compare_parser = subparsers.add_parser("compare", help="Compare faces in two images")
    compare_parser.add_argument("image1", help="Path to first image")
    compare_parser.add_argument("image2", help="Path to second image")
    compare_parser.add_argument("--threshold", type=float, default=MATCH_THRESHOLD, help="Match threshold")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    checker = FaceChecker()

    if args.command == "detect":
        result = checker.detect(args.image)
        if args.json:
            print(json.dumps({
                "has_face": result.has_face,
                "num_faces": result.num_faces,
                "confidence": result.confidence,
                "bbox": result.bbox,
            }))
        else:
            print(f"Face detected: {result.has_face}")
            if result.has_face:
                print(f"Number of faces: {result.num_faces}")
                print(f"Confidence: {result.confidence:.3f}")
                print(f"Bounding box: {result.bbox}")
        sys.exit(0 if result.has_face else 1)

    if args.command == "compare":
        result = checker.compare(args.image1, args.image2, threshold=args.threshold)
        if args.json:
            print(json.dumps({
                "face_in_first": result.face_in_first,
                "face_in_second": result.face_in_second,
                "similarity": result.similarity,
                "is_match": result.is_match,
            }))
        else:
            if not result.face_in_first:
                print("No face found in first image")
            elif not result.face_in_second:
                print("No face found in second image")
            else:
                print(f"Similarity: {result.similarity:.3f}")
                print(f"Match: {result.is_match}")
        sys.exit(0 if result.is_match else 1)


if __name__ == "__main__":
    main()
