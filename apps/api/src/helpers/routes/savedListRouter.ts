import express, { Request, Response } from "express";
import CAS from "../cas.js";
import SavedContactModel from "../models/SavedContactModel.js";
import SavedListModel, { MAX_SAVED_LIST_NAME_LENGTH, MAX_SAVED_LISTS } from "../models/SavedListModel.js";
import SavedListMemberModel from "../models/SavedListMemberModel.js";
import SavedListDefaultModel from "../models/SavedListDefaultModel.js";
import { invalidateSearchCache } from "./peopleRouter.js";

export default class SavedListRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/", CAS.requireAuthenticationSessionOnly, this.getLists);
		router.post("/", CAS.requireAuthenticationSessionOnly, this.createList);
		router.patch("/:id", CAS.requireAuthenticationSessionOnly, this.renameList);
		router.delete("/:id", CAS.requireAuthenticationSessionOnly, this.deleteList);
		router.delete("/:id/members/:netid", CAS.requireAuthenticationSessionOnly, this.removeMember);
		return router;
	};

	private parseName = (name: unknown): string | undefined => {
		if(typeof name !== "string") return undefined;
		const trimmed = name.trim();
		if(trimmed === "" || trimmed.length > MAX_SAVED_LIST_NAME_LENGTH) return undefined;
		return trimmed;
	};

	getLists = async (req: Request, res: Response) => {
		try {
			const [lists, counts, total, defaultListId] = await Promise.all([
				SavedListModel.getLists(req.netid),
				SavedListMemberModel.countByList(req.netid),
				SavedContactModel.countVisible(req.netid),
				SavedListDefaultModel.getDefault(req.netid),
			]);
			return res.status(200).json({
				lists: lists.map(l => l.toSanitizedObject(counts.get(l.id) ?? 0)),
				default_list_id: defaultListId,
				total,
			});
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching saved lists");
		}
	};

	createList = async (req: Request, res: Response) => {
		const name = this.parseName(req.body?.name);
		if(name === undefined) {
			return res.status(400).send(`List name must be 1 to ${MAX_SAVED_LIST_NAME_LENGTH} characters`);
		}

		try {
			if(await SavedListModel.count({ where: { owner_netid: req.netid } }) >= MAX_SAVED_LISTS) {
				return res.status(400).send(`You can have at most ${MAX_SAVED_LISTS} lists`);
			}
			if(await SavedListModel.isNameTaken(req.netid, name)) {
				return res.status(409).send("You already have a list with that name");
			}
			const list = await SavedListModel.create({ owner_netid: req.netid, name });
			return res.status(201).json({ list: list.toSanitizedObject(0) });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error creating list");
		}
	};

	renameList = async (req: Request, res: Response) => {
		const name = this.parseName(req.body?.name);
		if(name === undefined) {
			return res.status(400).send(`List name must be 1 to ${MAX_SAVED_LIST_NAME_LENGTH} characters`);
		}

		try {
			const list = await SavedListModel.findOwned(req.netid, req.params.id);
			if(!list) {
				return res.status(404).send("List not found");
			}
			if(await SavedListModel.isNameTaken(req.netid, name, list.id)) {
				return res.status(409).send("You already have a list with that name");
			}
			list.name = name;
			await list.save();
			const count = (await SavedListMemberModel.countByList(req.netid)).get(list.id) ?? 0;
			return res.status(200).json({ list: list.toSanitizedObject(count) });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error renaming list");
		}
	};

	deleteList = async (req: Request, res: Response) => {
		try {
			const list = await SavedListModel.findOwned(req.netid, req.params.id);
			if(!list) {
				return res.status(404).send("List not found");
			}
			await list.destroy();
			invalidateSearchCache(req.netid);
			return res.status(200).json({ deleted: true });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error deleting list");
		}
	};

	removeMember = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			const list = await SavedListModel.findOwned(req.netid, req.params.id);
			if(!list) {
				return res.status(404).send("List not found");
			}
			await SavedListMemberModel.destroy({ where: { list_id: list.id, saved_netid: netid } });
			invalidateSearchCache(req.netid);
			const listIds = (await SavedListMemberModel.getListIds(req.netid, [netid])).get(netid) ?? [];
			return res.status(200).json({ list_ids: listIds });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error removing from list");
		}
	};
}
