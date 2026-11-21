import SavedListModel from "./models/SavedListModel.js";
import SavedContactModel from "./models/SavedContactModel.js";
import SavedListMemberModel from "./models/SavedListMemberModel.js";
import SavedListDefaultModel from "./models/SavedListDefaultModel.js";
import { QueryTypes, type Transaction } from "sequelize";

export async function lockSavedLists(ownerNetid: string, transaction: Transaction) {
	await SavedListModel.sequelize!.query("SELECT pg_advisory_xact_lock(hashtext(:ownerNetid))", {
		replacements: { ownerNetid }, transaction,
	});
}

export async function pruneUnlistedContacts(ownerNetid: string, transaction: Transaction, netids?: string[]) {
	if(netids?.length === 0) return [];
	const removed = await SavedContactModel.sequelize!.query<{ saved_netid: string }>(`
		DELETE FROM saved_contact AS contact
		WHERE contact.owner_netid = :ownerNetid
			${netids ? "AND contact.saved_netid IN (:netids)" : ""}
			AND NOT EXISTS (
				SELECT 1 FROM saved_list_member AS member
				WHERE member.owner_netid = contact.owner_netid AND member.saved_netid = contact.saved_netid
			)
		RETURNING contact.saved_netid
	`, { replacements: { ownerNetid, netids }, transaction, type: QueryTypes.SELECT });
	return removed.map(contact => contact.saved_netid);
}

export async function ensureSavedLists(ownerNetid: string) {
	return SavedListModel.sequelize!.transaction(async transaction => {
		await lockSavedLists(ownerNetid, transaction);
		const lists = await SavedListModel.findAll({
			where: { owner_netid: ownerNetid }, order: [["id", "ASC"]], transaction,
		});
		let initializedList: { id: number; member_netids: string[] } | null = null;
		if(lists.length === 0) {
			const list = await SavedListModel.create({ owner_netid: ownerNetid, name: "Friends" }, { transaction });
			const saved = await SavedContactModel.findAll({ where: { owner_netid: ownerNetid }, transaction });
			await SavedListMemberModel.bulkCreate(saved.map(contact => ({
				list_id: list.id, owner_netid: ownerNetid, saved_netid: contact.saved_netid, created_at: contact.created_at,
			})), { transaction });
			lists.push(list);
			initializedList = { id: list.id, member_netids: saved.map(contact => contact.saved_netid) };
		}
		const preference = await SavedListDefaultModel.findByPk(ownerNetid, { transaction });
		const defaultListId = lists.find(list => list.id === preference?.list_id)?.id ?? lists[0].id;
		if(preference?.list_id !== defaultListId) await SavedListDefaultModel.setDefault(ownerNetid, defaultListId, transaction);
		const unsavedNetids = await pruneUnlistedContacts(ownerNetid, transaction);
		return { defaultListId, initializedList, unsavedNetids };
	});
}
