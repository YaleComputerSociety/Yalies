import express, { Request, Response } from "express";
import CAS from "../cas.js";
import ProfileLikeModel from "../models/ProfileLikeModel.js";

export default class ProfileLikeRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/:netid", CAS.requireAuthentication, this.getLikes);
		router.post("/:netid", CAS.requireAuthenticationSessionOnly, this.likePerson);
		router.delete("/:netid", CAS.requireAuthenticationSessionOnly, this.unlikePerson);
		return router;
	};

	getLikes = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			const count = await ProfileLikeModel.count({
				where: { liked_netid: netid },
			});
			const liked = await ProfileLikeModel.findOne({
				where: { liker_netid: req.netid, liked_netid: netid },
			});
			return res.status(200).json({ count, liked: !!liked });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching likes");
		}
	};

	likePerson = async (req: Request, res: Response) => {
		const { netid } = req.params;

		if(netid === req.netid) {
			return res.status(400).send("Cannot like your own profile");
		}

		try {
			await ProfileLikeModel.findOrCreate({
				where: { liker_netid: req.netid, liked_netid: netid },
				defaults: { liker_netid: req.netid, liked_netid: netid },
			});
			const count = await ProfileLikeModel.count({
				where: { liked_netid: netid },
			});
			return res.status(200).json({ count, liked: true });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error liking profile");
		}
	};

	unlikePerson = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			await ProfileLikeModel.destroy({
				where: { liker_netid: req.netid, liked_netid: netid },
			});
			const count = await ProfileLikeModel.count({
				where: { liked_netid: netid },
			});
			return res.status(200).json({ count, liked: false });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error unliking profile");
		}
	};
}
