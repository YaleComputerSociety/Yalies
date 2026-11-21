import express, { Request, Response } from "express";
import { Op, Sequelize } from "sequelize";
import CAS from "../cas.js";
import SavedContactModel from "../models/SavedContactModel.js";
import SavedListModel, { MAX_SAVED_LIST_NAME_LENGTH, MAX_SAVED_LIST_DESCRIPTION_LENGTH, MAX_SAVED_LISTS } from "../models/SavedListModel.js";
import PersonModel from "../models/PersonModel.js";
import SavedListMemberModel from "../models/SavedListMemberModel.js";
import { invalidateSearchCache } from "./peopleRouter.js";
import { ensureSavedLists, lockSavedLists, pruneUnlistedContacts } from "../savedLists.js";
import { getImportCandidates, resolveImport } from "../savedListImport.js";

export default class SavedListRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/", CAS.requireAuthenticationSessionOnly, this.getLists);
		router.post("/", CAS.requireAuthenticationSessionOnly, this.createList);
		router.post("/:id/duplicate", CAS.requireAuthenticationSessionOnly, this.duplicateList);
		router.post("/:id/import", CAS.requireAuthenticationSessionOnly, this.importMembers);
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

	private parseDescription = (value: unknown): string | null | undefined => {
		if(value === null) return null;
		if(typeof value !== "string" || value.length > MAX_SAVED_LIST_DESCRIPTION_LENGTH || /[\r\n]/.test(value)) return undefined;
		return value.trim() || null;
	};

	getLists = async (req: Request, res: Response) => {
		try {
			const { defaultListId, initializedList, unsavedNetids } = await ensureSavedLists(req.netid);
			if(initializedList || unsavedNetids.length) invalidateSearchCache(req.netid);
			const [lists, counts, total] = await Promise.all([
				SavedListModel.getLists(req.netid),
				SavedListMemberModel.countByList(req.netid),
				SavedContactModel.countVisible(req.netid),
			]);
			return res.status(200).json({
				lists: lists.map(l => l.toSanitizedObject(counts.get(l.id) ?? 0)),
				default_list_id: defaultListId,
				total,
				initialized_list: initializedList,
				unsaved_netids: unsavedNetids,
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
		const description = req.body?.description === undefined ? null : this.parseDescription(req.body.description);
		if(description === undefined) return res.status(400).send(`Description must be one line of at most ${MAX_SAVED_LIST_DESCRIPTION_LENGTH} characters`);

		try {
			if(await SavedListModel.count({ where: { owner_netid: req.netid } }) >= MAX_SAVED_LISTS) {
				return res.status(400).send(`You can have at most ${MAX_SAVED_LISTS} lists`);
			}
			if(await SavedListModel.isNameTaken(req.netid, name)) {
				return res.status(409).send("You already have a list with that name");
			}
			const list = await SavedListModel.create({ owner_netid: req.netid, name, description });
			return res.status(201).json({ list: list.toSanitizedObject(0) });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error creating list");
		}
	};

	duplicateList = async (req: Request, res: Response) => {
		try {
			const source = await SavedListModel.findOwned(req.netid, req.params.id);
			if(!source) return res.status(404).send("List not found");
			if(await SavedListModel.count({ where: { owner_netid: req.netid } }) >= MAX_SAVED_LISTS) {
				return res.status(400).send(`You can have at most ${MAX_SAVED_LISTS} lists`);
			}
			const { list, memberNetids } = await SavedListModel.sequelize!.transaction(async transaction => {
				await lockSavedLists(req.netid, transaction);
				// Serialize copies of this source so repeated clicks get distinct names.
				await source.reload({ transaction, lock: transaction.LOCK.UPDATE });
				let name = "";
				for(let copy = 1; ; copy++) {
					const suffix = copy === 1 ? " (copy)" : ` (copy ${copy})`;
					name = source.name.slice(0, MAX_SAVED_LIST_NAME_LENGTH - suffix.length).trimEnd() + suffix;
					if(!await SavedListModel.isNameTaken(req.netid, name)) break;
				}
				const duplicate = await SavedListModel.create({ owner_netid: req.netid, name, description: source.description }, { transaction });
				const members = await SavedListMemberModel.findAll({
					where: { list_id: source.id, owner_netid: req.netid }, transaction,
				});
				await SavedListMemberModel.bulkCreate(members.map(member => ({
					list_id: duplicate.id, owner_netid: req.netid,
					saved_netid: member.saved_netid, created_at: member.created_at,
				})), { transaction });
				return { list: duplicate, memberNetids: members.map(member => member.saved_netid) };
			});
			invalidateSearchCache(req.netid);
			const count = (await SavedListMemberModel.countByList(req.netid)).get(list.id) ?? 0;
			return res.status(201).json({ list: list.toSanitizedObject(count), member_netids: memberNetids });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error duplicating list");
		}
	};

	renameList = async (req: Request, res: Response) => {
		const hasName = req.body?.name !== undefined;
		const hasDescription = req.body?.description !== undefined;
		if(!hasName && !hasDescription) return res.status(400).send("Supply a list name or description");
		const name = hasName ? this.parseName(req.body.name) : undefined;
		if(hasName && name === undefined) {
			return res.status(400).send(`List name must be 1 to ${MAX_SAVED_LIST_NAME_LENGTH} characters`);
		}
		const description = hasDescription ? this.parseDescription(req.body.description) : undefined;
		if(hasDescription && description === undefined) return res.status(400).send(`Description must be one line of at most ${MAX_SAVED_LIST_DESCRIPTION_LENGTH} characters`);

		try {
			const list = await SavedListModel.findOwned(req.netid, req.params.id);
			if(!list) {
				return res.status(404).send("List not found");
			}
			if(name !== undefined && await SavedListModel.isNameTaken(req.netid, name, list.id)) {
				return res.status(409).send("You already have a list with that name");
			}
			if(name !== undefined) list.name = name;
			if(description !== undefined) list.description = description;
			await list.save();
			const count = (await SavedListMemberModel.countByList(req.netid)).get(list.id) ?? 0;
			return res.status(200).json({ list: list.toSanitizedObject(count) });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error renaming list");
		}
	};

	importMembers = async (req: Request, res: Response) => {
		let candidates: ReturnType<typeof getImportCandidates>;
		try { candidates = getImportCandidates(req.body?.text); }
		catch(error) { return res.status(400).send(error instanceof Error ? error.message : "Invalid import"); }
		try {
			const list = await SavedListModel.findOwned(req.netid, req.params.id);
			if(!list) return res.status(404).send("List not found");
			const identifiers = [...new Set(candidates.flatMap(candidate => candidate.tokens))];
			const people = await PersonModel.findAll({
				where: { [Op.or]: ["netid", "email"].map(field =>
					Sequelize.where(Sequelize.fn("LOWER", Sequelize.col(field)), { [Op.in]: identifiers })) },
				attributes: ["netid", "email"], raw: true,
			});
			const resolution = resolveImport(candidates, people, req.netid);
			const added = await SavedListModel.sequelize!.transaction(async transaction => {
				await lockSavedLists(req.netid, transaction);
				await list.reload({ transaction, lock: transaction.LOCK.UPDATE });
				const members = await SavedListMemberModel.findAll({ where: { list_id: list.id, owner_netid: req.netid }, transaction });
				const existing = new Set(members.map(member => member.saved_netid));
				await SavedContactModel.bulkCreate(resolution.netids.map(netid => ({ owner_netid: req.netid, saved_netid: netid })), { ignoreDuplicates: true, transaction });
				await SavedListMemberModel.bulkCreate(resolution.netids.map(netid => ({ list_id: list.id, owner_netid: req.netid, saved_netid: netid })), { ignoreDuplicates: true, transaction });
				return resolution.netids.filter(netid => !existing.has(netid)).length;
			});
			invalidateSearchCache(req.netid);
			const contacts = resolution.netids.length ? await SavedContactModel.findAll({
				where: { owner_netid: req.netid, saved_netid: { [Op.in]: resolution.netids } },
			}) : [];
			const listIds = await SavedListMemberModel.getListIds(req.netid, resolution.netids);
			return res.status(200).json({ ...resolution, added, matched: resolution.netids.length,
				already_in_list: resolution.netids.length - added,
				saved: contacts.map(contact => ({ ...contact.toSanitizedObject(), list_ids: listIds.get(contact.saved_netid) ?? [] })),
			});
		} catch(error) {
			console.error(error);
			return res.status(500).send("Error importing list members");
		}
	};

	deleteList = async (req: Request, res: Response) => {
		try {
			const list = await SavedListModel.findOwned(req.netid, req.params.id);
			if(!list) {
				return res.status(404).send("List not found");
			}
			const unsavedNetids = await SavedListModel.sequelize!.transaction(async transaction => {
				await lockSavedLists(req.netid, transaction);
				const members = await SavedListMemberModel.findAll({ where: { list_id: list.id, owner_netid: req.netid }, transaction });
				await SavedListMemberModel.destroy({ where: { list_id: list.id, owner_netid: req.netid }, transaction });
				await list.destroy({ transaction });
				return pruneUnlistedContacts(req.netid, transaction, members.map(member => member.saved_netid));
			});
			invalidateSearchCache(req.netid);
			return res.status(200).json({ deleted: true, unsaved_netids: unsavedNetids });
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
			const listIds = await SavedListModel.sequelize!.transaction(async transaction => {
				await lockSavedLists(req.netid, transaction);
				await SavedListMemberModel.destroy({ where: { list_id: list.id, owner_netid: req.netid, saved_netid: netid }, transaction });
				await pruneUnlistedContacts(req.netid, transaction, [netid]);
				const remaining = await SavedListMemberModel.findAll({ where: { owner_netid: req.netid, saved_netid: netid }, transaction, order: [["list_id", "ASC"]] });
				return remaining.map(member => member.list_id);
			});
			invalidateSearchCache(req.netid);
			return res.status(200).json({ saved: listIds.length > 0, list_ids: listIds });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error removing from list");
		}
	};
}
