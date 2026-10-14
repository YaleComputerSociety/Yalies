import express, { Request, Response } from "express";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import path from "path";
import fs from "fs";
import os from "os";
import { randomUUID } from "crypto";
import CAS from "../cas.js";
import UserProfileModel from "../models/UserProfileModel.js";
import PersonModel from "../models/PersonModel.js";
import DataChangeRequestModel from "../models/DataChangeRequestModel.js";
import { detectFace, compareFaces, shouldRunFacecheck } from "../facecheck.js";
import { CHANGE_REQUEST_ALLOWED_FIELDS } from "yalies-shared";

const GCS_BUCKET_NAME = "yalies-photos";
// On Cloud Run we authenticate via the attached runtime service account
// (Application Default Credentials). Only use an explicit key file when one is
// actually configured (e.g. local dev with GOOGLE_APPLICATION_CREDENTIALS set);
// never fall back to a hardcoded path that doesn't exist in the container.
const GCS_KEY_FILENAME = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const PENDING_PHOTO_PREFIX = "pending-profile-photos/";
const PHOTO_TYPES: Record<string, { extension: string; signature: (buffer: Buffer) => boolean }> = {
	"image/jpeg": {
		extension: "jpg",
		signature: (buffer) => buffer.length >= 3
			&& buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
	},
	"image/png": {
		extension: "png",
		signature: (buffer) => buffer.length >= 8
			&& buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
	},
	"image/webp": {
		extension: "webp",
		signature: (buffer) => buffer.length >= 12
			&& buffer.subarray(0, 4).toString("ascii") === "RIFF"
			&& buffer.subarray(8, 12).toString("ascii") === "WEBP",
	},
};
const SOCIAL_HOSTS = {
	linkedin: new Set(["linkedin.com", "www.linkedin.com"]),
	instagram: new Set(["instagram.com", "www.instagram.com"]),
};

type SocialPlatform = keyof typeof SOCIAL_HOSTS;

function normalizeExternalUrl(url: string) {
	const trimmedUrl = url.trim();
	if(/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;
	if(trimmedUrl.startsWith("//")) return `https:${trimmedUrl}`;
	return `https://${trimmedUrl.replace(/^\/+/, "")}`;
}

function normalizeSocialUrl(platform: SocialPlatform, value: unknown) {
	if(value === undefined) return undefined;
	if(value === null) return null;
	if(typeof value !== "string") return null;

	const trimmedUrl = value.trim();
	if(!trimmedUrl) return null;
	const normalizedUrl = normalizeExternalUrl(trimmedUrl);

	try {
		const parsedUrl = new URL(normalizedUrl);
		if(parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return null;
		if(!SOCIAL_HOSTS[platform].has(parsedUrl.hostname.toLowerCase())) return null;
		return normalizedUrl;
	} catch {
		return null;
	}
}

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, 
	fileFilter: (_req, file, cb) => {
		if(PHOTO_TYPES[file.mimetype]) cb(null, true);
		else cb(new Error("Upload a JPEG, PNG, or WebP image"));
	},
});

function bucketObjectFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if(parsed.hostname !== "storage.googleapis.com") return null;
		const prefix = `/${GCS_BUCKET_NAME}/`;
		if(!parsed.pathname.startsWith(prefix)) return null;
		return decodeURIComponent(parsed.pathname.slice(prefix.length));
	} catch {
		return null;
	}
}

// Run multer and turn its rejections into JSON responses. Without this, multer
// errors (file too large, non-image) fall through to Express's default handler,
// which returns an HTML 500 the frontend can't parse.
const uploadPhotoMiddleware = (req: Request, res: Response, next: express.NextFunction) => {
	upload.single("photo")(req, res, (err: unknown) => {
		if(err instanceof multer.MulterError) {
			if(err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Photo must be under 5MB" });
			return res.status(400).json({ error: err.message });
		}
		if(err instanceof Error) return res.status(415).json({ error: err.message });
		return next();
	});
};

export default class UserProfileRouter {
	#gcs: Storage;

	constructor() {
		this.#gcs = new Storage(GCS_KEY_FILENAME ? { keyFilename: GCS_KEY_FILENAME } : {});
	}

	getRouter = () => {
		const router = express.Router();
		router.get("/me/full", CAS.requireAuthenticationSessionOnly, this.getMyFullProfile);
		router.get("/me", CAS.requireAuthenticationSessionOnly, this.getMyProfile);
		router.put("/me", CAS.requireAuthenticationSessionOnly, this.updateMyProfile);
		router.post("/me/photo", CAS.requireAuthenticationSessionOnly, uploadPhotoMiddleware, this.uploadPhoto);
		router.get("/me/photo/download", CAS.requireAuthenticationSessionOnly, this.downloadMyPhoto);
		router.post("/me/change-request", CAS.requireAuthenticationSessionOnly, this.submitChangeRequest);
		router.delete("/me", CAS.requireAuthenticationSessionOnly, this.deleteMyProfile);
		router.get("/:netid", CAS.requireAuthentication, this.getProfile);
		return router;
	};

	getMyFullProfile = async (req: Request, res: Response) => {
		try {
			const [profile, person, pendingRequests] = await Promise.all([
				UserProfileModel.findByPk(req.netid),
				PersonModel.findOne({ where: { netid: req.netid } }),
				DataChangeRequestModel.findAll({
					where: { requester_netid: req.netid, status: "pending" },
					order: [["created_at", "DESC"]],
				}),
			]);
			const pendingPhotoRequest = pendingRequests.find((request) => {
				const image = request.requested_changes?.image;
				return typeof image === "string" && bucketObjectFromUrl(image)?.startsWith(PENDING_PHOTO_PREFIX);
			});
			return res.status(200).json({
				profile: profile ? profile.toSanitizedObject() : { netid: req.netid },
				person: person ? person.toSanitizedObject() : null,
				photo_request: pendingPhotoRequest ? {
					id: pendingPhotoRequest.id,
					status: pendingPhotoRequest.status,
					created_at: pendingPhotoRequest.created_at,
					preview_image: pendingPhotoRequest.requested_changes.image,
				} : null,
			});
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching full profile");
		}
	};

	getMyProfile = async (req: Request, res: Response) => {
		try {
			const profile = await UserProfileModel.findByPk(req.netid);
			if(!profile) {
				return res.status(200).json({ netid: req.netid });
			}
			return res.status(200).json(profile.toSanitizedObject());
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching profile");
		}
	};

	updateMyProfile = async (req: Request, res: Response) => {
		const { description, interests, linkedin_url, instagram_url, classes } = req.body;
		const normalizedLinkedinUrl = normalizeSocialUrl("linkedin", linkedin_url);
		const normalizedInstagramUrl = normalizeSocialUrl("instagram", instagram_url);

		if(linkedin_url !== undefined && normalizedLinkedinUrl === null && linkedin_url !== null && String(linkedin_url).trim() !== "") {
			return res.status(400).send("LinkedIn URL must be on linkedin.com.");
		}
		if(instagram_url !== undefined && normalizedInstagramUrl === null && instagram_url !== null && String(instagram_url).trim() !== "") {
			return res.status(400).send("Instagram URL must be on instagram.com.");
		}

		try {
			const [profile] = await UserProfileModel.upsert({
				netid: req.netid,
				...description !== undefined && { description },
				...interests !== undefined && { interests },
				...linkedin_url !== undefined && { linkedin_url: normalizedLinkedinUrl },
				...instagram_url !== undefined && { instagram_url: normalizedInstagramUrl },
				...classes !== undefined && { classes },
				updated_at: new Date(),
			});
			return res.status(200).json(profile.toSanitizedObject());
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error updating profile");
		}
	};

	deleteMyProfile = async (req: Request, res: Response) => {
		try {
			const deleted = await UserProfileModel.destroy({
				where: { netid: req.netid },
			});
			if(deleted === 0) {
				return res.status(200).send("No profile to delete");
			}
			return res.status(200).send("Profile deleted");
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error deleting profile");
		}
	};

	uploadPhoto = async (req: Request, res: Response) => {
		if(!req.file) {
			return res.status(400).send("No photo uploaded");
		}
		const photoType = PHOTO_TYPES[req.file.mimetype];
		if(!photoType || !photoType.signature(req.file.buffer)) {
			return res.status(415).json({ error: "The uploaded file is not a valid JPEG, PNG, or WebP image." });
		}

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yalies-photo-"));
		const newPhotoPath = path.join(tmpDir, "new.jpg");
		let pendingObjectName: string | null = null;

		try {
			const person = await PersonModel.findOne({ where: { netid: req.netid } });
			if(!person) {
				return res.status(403).send("Person not found in directory");
			}

			const pendingRequests = await DataChangeRequestModel.findAll({
				where: { requester_netid: req.netid, status: "pending" },
			});
			const existingPhotoRequest = pendingRequests.find((request) => {
				const image = request.requested_changes?.image;
				return typeof image === "string" && bucketObjectFromUrl(image)?.startsWith(PENDING_PHOTO_PREFIX);
			});
			if(existingPhotoRequest) {
				return res.status(409).json({
					error: "You already have a profile photo awaiting review.",
					request_id: existingPhotoRequest.id,
				});
			}

			const canFacecheck = await shouldRunFacecheck();
			if(canFacecheck) {
				fs.writeFileSync(newPhotoPath, req.file.buffer);

				const detectResult = await detectFace(newPhotoPath);
				if(!detectResult.has_face) {
					return res.status(400).json({
						error: "No face detected in the uploaded photo. Please upload a clear photo of your face.",
					});
				}

				if(person.image) {
					try {
						const existingPhotoPath = path.join(tmpDir, "existing.jpg");
						const existingFilename = bucketObjectFromUrl(person.image);
						if(!existingFilename) throw new Error("Current photo is not stored in the Yalies photo bucket");

						const bucket = this.#gcs.bucket(GCS_BUCKET_NAME);
						const [existingBuffer] = await bucket.file(existingFilename).download();
						fs.writeFileSync(existingPhotoPath, existingBuffer);

						const existingDetect = await detectFace(existingPhotoPath);
						if(existingDetect.has_face) {
							const compareResult = await compareFaces(existingPhotoPath, newPhotoPath);
							if(!compareResult.is_match) {
								return res.status(400).json({
									error: "The uploaded photo does not appear to be the same person as your current photo.",
									similarity: compareResult.similarity,
								});
							}
						}
					} catch(compareErr) {
						// Couldn't read/verify the existing photo — skip the
						// same-person check rather than blocking a valid upload.
						console.warn("[photo upload] Skipping comparison to existing photo:", compareErr);
					}
				}
			}

			const bucket = this.#gcs.bucket(GCS_BUCKET_NAME);
			pendingObjectName = `${PENDING_PHOTO_PREFIX}${req.netid}/${randomUUID()}.${photoType.extension}`;
			const gcsFile = bucket.file(pendingObjectName);

			console.log(`[photo upload] Queuing ${req.file.buffer.length} bytes at gs://${GCS_BUCKET_NAME}/${pendingObjectName}`);
			await gcsFile.save(req.file.buffer, {
				contentType: req.file.mimetype,
				metadata: { cacheControl: "no-store" },
			});

			const imageUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${pendingObjectName}`;
			const request = await DataChangeRequestModel.create({
				requester_netid: req.netid,
				target_netid: req.netid,
				status: "pending",
				requested_changes: { image: imageUrl },
			});
			pendingObjectName = null;

			return res.status(202).json({
				status: "pending",
				request_id: request.id,
				request: {
					id: request.id,
					created_at: request.created_at,
				},
				preview_image: imageUrl,
			});
		} catch(e) {
			console.error("[photo upload] Error:", e);
			if(pendingObjectName) {
				try {
					await this.#gcs.bucket(GCS_BUCKET_NAME).file(pendingObjectName).delete({ ignoreNotFound: true });
				} catch(cleanupError) {
					console.warn("[photo upload] Could not clean up pending object:", cleanupError);
				}
			}
			return res.status(500).json({ error: "Error uploading photo" });
		} finally {

			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	};

	downloadMyPhoto = async (req: Request, res: Response) => {
		try {
			const person = await PersonModel.findOne({ where: { netid: req.netid } });
			if(!person?.image) {
				return res.status(404).send("No photo found");
			}

			const filename = bucketObjectFromUrl(person.image);
			if(!filename) return res.status(400).send("Photo is not stored in the Yalies photo bucket");

			const bucket = this.#gcs.bucket(GCS_BUCKET_NAME);
			const file = bucket.file(filename);
			const [[buffer], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
			const extension = filename.split(".").pop()?.toLowerCase() || "jpg";

			res.set("Content-Type", metadata.contentType || "application/octet-stream");
			res.set("Content-Disposition", `attachment; filename="${person.first_name}_${person.last_name}.${extension}"`);
			return res.send(buffer);
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error downloading photo");
		}
	};

	submitChangeRequest = async (req: Request, res: Response) => {
		const { requested_changes } = req.body;

		if(!requested_changes || typeof requested_changes !== "object" || Array.isArray(requested_changes)) {
			return res.status(400).send("requested_changes must be an object");
		}

		const allowedSet = new Set<string>(CHANGE_REQUEST_ALLOWED_FIELDS);
		const filtered: Record<string, string | number | null> = {};

		for(const [key, value] of Object.entries(requested_changes)) {
			if(!allowedSet.has(key)) {
				return res.status(400).send(`Field "${key}" is not allowed`);
			}
			if(value !== null && typeof value !== "string" && typeof value !== "number") {
				return res.status(400).send(`Field "${key}" must be a string, number, or null`);
			}
			if(value !== null && value !== "") {
				filtered[key] = value as string | number;
			}
		}

		if(Object.keys(filtered).length === 0) {
			return res.status(400).send("No fields to change");
		}

		try {
			const request = await DataChangeRequestModel.create({
				requester_netid: req.netid,
				target_netid: req.netid,
				status: "pending",
				requested_changes: filtered,
			});
			return res.status(201).json(request.toJSON());
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error submitting change request");
		}
	};

	getProfile = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			const profile = await UserProfileModel.findByPk(netid);
			if(!profile) {
				return res.status(200).json({ netid });
			}
			return res.status(200).json(profile.toSanitizedObject());
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching profile");
		}
	};
}
