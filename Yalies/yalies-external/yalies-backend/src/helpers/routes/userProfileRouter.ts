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
const GCS_SERVICE_KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS
	|| path.resolve(process.cwd(), "../../../.config/gcloud/service-key.json");

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, 
	fileFilter: (_req, file, cb) => {
		if(file.mimetype.startsWith("image/")) cb(null, true);
		else cb(new Error("Only image files are allowed"));
	},
});

export default class UserProfileRouter {
	#gcs: Storage;

	constructor() {
		this.#gcs = new Storage({ keyFilename: GCS_SERVICE_KEY });
	}

	getRouter = () => {
		const router = express.Router();
		router.get("/me/full", CAS.requireAuthenticationSessionOnly, this.getMyFullProfile);
		router.get("/me", CAS.requireAuthenticationSessionOnly, this.getMyProfile);
		router.put("/me", CAS.requireAuthenticationSessionOnly, this.updateMyProfile);
		router.post("/me/photo", CAS.requireAuthenticationSessionOnly, upload.single("photo"), this.uploadPhoto);
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

		try {
			const [profile] = await UserProfileModel.upsert({
				netid: req.netid,
				...description !== undefined && { description },
				...interests !== undefined && { interests },
				...linkedin_url !== undefined && { linkedin_url },
				...instagram_url !== undefined && { instagram_url },
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
				}
			}

			let filename: string;
			if(person.image) {
				const urlParts = person.image.split("/");
				filename = urlParts[urlParts.length - 1];
			} else {
				filename = `${req.netid}.jpg`;
			}

			const bucket = this.#gcs.bucket(GCS_BUCKET_NAME);
			const gcsFile = bucket.file(filename);

			console.log(`[photo upload] Saving ${req.file.buffer.length} bytes to gs://${GCS_BUCKET_NAME}/${filename}`);
			await gcsFile.save(req.file.buffer, {
				contentType: req.file.mimetype,
				metadata: { cacheControl: "no-store" },
			});
			console.log(`[photo upload] Saved successfully`);

			const imageUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${filename}`;
			if(!person.image) {
				await PersonModel.update({ image: imageUrl }, { where: { netid: req.netid } });
			}

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
