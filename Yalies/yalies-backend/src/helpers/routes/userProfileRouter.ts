import express, { Request, Response } from "express";
import CAS from "../cas.js";
import UserProfileModel from "../models/UserProfileModel.js";

export default class UserProfileRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/me", CAS.requireAuthenticationSessionOnly, this.getMyProfile);
		router.put("/me", CAS.requireAuthenticationSessionOnly, this.updateMyProfile);
		router.delete("/me", CAS.requireAuthenticationSessionOnly, this.deleteMyProfile);
		router.get("/:netid", CAS.requireAuthentication, this.getProfile);
		return router;
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
