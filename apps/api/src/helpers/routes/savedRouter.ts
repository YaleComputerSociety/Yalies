import express, { Request, Response } from "express";
import CAS from "../cas.js";
import PersonModel from "../models/PersonModel.js";
import SavedContactModel, { MAX_SAVED_NOTE_LENGTH } from "../models/SavedContactModel.js";
import SavedListModel from "../models/SavedListModel.js";
import SavedListMemberModel from "../models/SavedListMemberModel.js";
import SavedListDefaultModel from "../models/SavedListDefaultModel.js";
import { invalidateSearchCache } from "./peopleRouter.js";

export default class SavedRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/me", CAS.requireAuthenticationSessionOnly, this.getMySaved);
		router.get("/:netid", CAS.requireAuthenticationSessionOnly, this.getSavedContact);
		router.put("/:netid", CAS.requireAuthenticationSessionOnly, this.saveContact);
		router.patch("/:netid", CAS.requireAuthenticationSessionOnly, this.updateNote);
		router.delete("/:netid", CAS.requireAuthenticationSessionOnly, this.unsaveContact);
		return router;
	};

	private parseNote = (note: unknown): string | null | undefined => {
		if(note === undefined || note === null) return null;
		if(typeof note !== "string" || note.length > MAX_SAVED_NOTE_LENGTH) return undefined;
		return note.trim() === "" ? null : note;
	};

	getMySaved = async (req: Request, res: Response) => {
		try {
			const rows = await SavedContactModel.getSaved(req.netid);
			const listIds = await SavedListMemberModel.getListIds(req.netid, rows.map(r => r.saved_netid));
			return res.status(200).json({
				saved: rows.map(r => ({ ...r.toSanitizedObject(), list_ids: listIds.get(r.saved_netid) ?? [] })),
			});
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching saved contacts");
		}
	};

	getSavedContact = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			const row = await SavedContactModel.findOne({ where: { owner_netid: req.netid, saved_netid: netid } });
			const listIds = row ? (await SavedListMemberModel.getListIds(req.netid, [netid])).get(netid) ?? [] : [];
			return res.status(200).json({ saved: !!row, note: row?.note ?? null, list_ids: listIds });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching saved contact");
		}
	};

	saveContact = async (req: Request, res: Response) => {
		const { netid } = req.params;

		if(netid === req.netid) {
			return res.status(400).send("Cannot save yourself");
		}
		const note = this.parseNote(req.body?.note);
		if(note === undefined) {
			return res.status(400).send(`Note must be a string of at most ${MAX_SAVED_NOTE_LENGTH} characters`);
		}
		const listChosen = req.body?.list_id !== undefined;

		try {
			const person = await PersonModel.findOne({ where: { netid }, attributes: ["netid"] });
			if(!person) {
				return res.status(404).send("Person not found");
			}

			let listId: number | null = null;
			if(listChosen && req.body.list_id !== null) {
				const list = await SavedListModel.findOwned(req.netid, req.body.list_id);
				if(!list) {
					return res.status(404).send("List not found");
				}
				listId = list.id;
			} else if(!listChosen) {
				listId = await SavedListDefaultModel.getDefault(req.netid);
			}

			const row = await SavedContactModel.sequelize!.transaction(async transaction => {
				const [saved, created] = await SavedContactModel.findOrCreate({
					where: { owner_netid: req.netid, saved_netid: netid },
					defaults: { note },
					transaction,
				});
				if(!created && req.body?.note !== undefined) {
					saved.note = note;
					await saved.save({ transaction });
				}
				if(listId !== null) {
					await SavedListMemberModel.findOrCreate({
						where: { list_id: listId, saved_netid: netid },
						defaults: { owner_netid: req.netid },
						transaction,
					});
				}
				if(listChosen) {
					await SavedListDefaultModel.setDefault(req.netid, listId, transaction);
				}
				return saved;
			});

			invalidateSearchCache(req.netid);
			const listIds = (await SavedListMemberModel.getListIds(req.netid, [netid])).get(netid) ?? [];
			return res.status(200).json({ saved: true, note: row.note, list_ids: listIds, default_list_id: listId });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error saving contact");
		}
	};

	updateNote = async (req: Request, res: Response) => {
		const { netid } = req.params;
		const note = this.parseNote(req.body?.note);
		if(note === undefined) {
			return res.status(400).send(`Note must be a string of at most ${MAX_SAVED_NOTE_LENGTH} characters`);
		}

		try {
			const row = await SavedContactModel.findOne({ where: { owner_netid: req.netid, saved_netid: netid } });
			if(!row) {
				return res.status(404).send("Contact is not saved");
			}
			row.note = note;
			await row.save();
			invalidateSearchCache(req.netid);
			return res.status(200).json({ saved: true, note });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error updating note");
		}
	};

	unsaveContact = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			await SavedContactModel.destroy({ where: { owner_netid: req.netid, saved_netid: netid } });
			invalidateSearchCache(req.netid);
			return res.status(200).json({ saved: false, note: null, list_ids: [] });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error removing saved contact");
		}
	};
}
