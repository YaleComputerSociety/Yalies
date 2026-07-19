import express, { Request, Response } from "express";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import path from "path";
import fs from "fs";
import os from "os";
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
		if(file.mimetype.startsWith("image/")) cb(null, true);
		else cb(new Error("Only image files are allowed"));
	},
});

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
			const [profile, person] = await Promise.all([
				UserProfileModel.findByPk(req.netid),
				PersonModel.findOne({ where: { netid: req.netid } }),
			]);
			return res.status(200).json({
				profile: profile ? profile.toSanitizedObject() : { netid: req.netid },
				person: person ? person.toSanitizedObject() : null,
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

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yalies-photo-"));
		const newPhotoPath = path.join(tmpDir, "new.jpg");

		try {
			const person = await PersonModel.findOne({ where: { netid: req.netid } });
			if(!person) {
				return res.status(403).send("Person not found in directory");
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
						const urlParts = person.image.split("/");
						const existingFilename = urlParts[urlParts.length - 1];

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

			// Reuse the existing object name when it's a clean bucket object,
			// otherwise fall back to a deterministic per-user name so a malformed
			// or non-GCS existing URL can't send the upload to a bogus object.
			let filename = `${req.netid}.jpg`;
			if(person.image) {
				const candidate = person.image.split("?")[0].split("/").pop() ?? "";
				if(/^[\w.-]+\.(jpe?g|png|webp)$/i.test(candidate)) filename = candidate;
			}

			const bucket = this.#gcs.bucket(GCS_BUCKET_NAME);
			const gcsFile = bucket.file(filename);

			console.log(`[photo upload] Saving ${req.file.buffer.length} bytes to gs://${GCS_BUCKET_NAME}/${filename}`);
			await gcsFile.save(req.file.buffer, {
				contentType: req.file.mimetype,
				metadata: { cacheControl: "no-store" },
			});
			console.log("[photo upload] Saved successfully");

			const imageUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${filename}`;
			await PersonModel.update({ image: imageUrl }, { where: { netid: req.netid } });

			return res.status(200).json({ image: imageUrl });
		} catch(e) {
			console.error("[photo upload] Error:", e);
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

			const urlParts = person.image.split("/");
			const filename = urlParts[urlParts.length - 1];

			const bucket = this.#gcs.bucket(GCS_BUCKET_NAME);
			const file = bucket.file(filename);
			const [buffer] = await file.download();

			res.set("Content-Type", "image/jpeg");
			res.set("Content-Disposition", `attachment; filename="${person.first_name}_${person.last_name}.jpg"`);
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
