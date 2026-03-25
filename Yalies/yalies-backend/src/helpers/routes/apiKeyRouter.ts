import express, {Request, Response} from "express";
import APIKeyModel from "../models/APIKeyModel.js";
import CAS from "../cas.js";
import { RequestUser } from "../types.js";
import { generateApiKey } from "../util.js";

export default class APIKeyRouter {
	getRouter = () => {
		const router = express.Router();
		router.post("/create", CAS.requireAuthenticationSessionOnly, this.generateApiKey);
		router.post("/revoke", CAS.requireAuthenticationSessionOnly, this.revokeApiKey);
		router.get("/list", CAS.requireAuthenticationSessionOnly, this.listApiKeys);
		return router;
	};

	generateApiKey = async (req: Request, res: Response) => {
		const description = req.body.description || "";
		if(!description) return res.status(400).send("Description is required");

		const netid = req.netid;

		const key = generateApiKey();
		
		const newKey = APIKeyModel.build({
			owner_netid: netid,
			created_on: new Date(),
			description,
			key,
			uses_count: 0,
		});

		try {
			await newKey.save();
		} catch(e) {
			console.error(e);
			res.status(500).send("Error generating API key");
			return;
		}

		let newKeyEntry;
		try {
			newKeyEntry = await APIKeyModel.findOne({
				where: { key },
			});
		} catch(e) {
			console.error(e);
			res.status(500).send("Error fetching API key");
			return;
		}

		res.status(200).json({
			id: newKeyEntry.id,
			description: newKeyEntry.description,
			created_on: newKeyEntry.created_on,
			uses_count: newKeyEntry.uses_count,
			key: newKeyEntry.key,
		});
	};

	revokeApiKey = async (req: Request, res: Response) => {
		const netid = req.netid;
		const { id } = req.body;

		if(!id) return res.status(400).send("ID is required");

		try {
			await APIKeyModel.destroy({
				where: {
					id,
					owner_netid: netid,
				},
			});
		} catch(e) {
			console.error(e);
			res.status(500).send("Error revoking API key");
			return;
		}
		res.status(200).end();
	};

	listApiKeys = async (req: Request, res: Response) => {
		const netid = req.netid;

		let keys: APIKeyModel[];
		try {
			keys = await APIKeyModel.findAll({
				where: { owner_netid: netid },
			});
		} catch(e) {
			console.error(e);
			res.status(500).send("Error fetching API keys");
			return;
		}
		const data = keys.map(key => ({
			id: key.id,
			description: key.description,
			created_on: key.created_on,
			uses_count: key.uses_count,
		}));
		res.status(200).json(data);
	};
};
