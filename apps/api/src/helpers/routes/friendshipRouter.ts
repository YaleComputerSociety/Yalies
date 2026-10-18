import express, { Request, Response } from "express";
import { Op } from "sequelize";
import CAS from "../cas.js";
import FriendshipModel from "../models/FriendshipModel.js";

export default class FriendshipRouter {
	getRouter = () => {
		const router = express.Router();
		router.get("/me", CAS.requireAuthenticationSessionOnly, this.getMyFriends);
		router.get("/requests", CAS.requireAuthenticationSessionOnly, this.getMyRequests);
		router.get("/status/:netid", CAS.requireAuthentication, this.getFriendshipStatus);
		router.get("/count/:netid", CAS.requireAuthentication, this.getFriendCount);
		router.post("/request/:netid", CAS.requireAuthenticationSessionOnly, this.sendRequest);
		router.post("/accept/:netid", CAS.requireAuthenticationSessionOnly, this.acceptRequest);
		router.post("/decline/:netid", CAS.requireAuthenticationSessionOnly, this.declineRequest);
		router.delete("/:netid", CAS.requireAuthenticationSessionOnly, this.removeFriend);
		return router;
	};

	getMyFriends = async (req: Request, res: Response) => {
		try {
			const friends = await FriendshipModel.getFriends(req.netid);
			return res.status(200).json({ friends });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching friends");
		}
	};

	getMyRequests = async (req: Request, res: Response) => {
		try {
			const requests = await FriendshipModel.getPendingRequests(req.netid);
			return res.status(200).json({ requests });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching requests");
		}
	};

	getFriendshipStatus = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			const status = await FriendshipModel.getStatus(req.netid, netid);
			const count = await FriendshipModel.getFriendCount(netid);
			return res.status(200).json({ status, count });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching friendship status");
		}
	};

	getFriendCount = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			const count = await FriendshipModel.getFriendCount(netid);
			return res.status(200).json({ count });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching friend count");
		}
	};

	sendRequest = async (req: Request, res: Response) => {
		const { netid } = req.params;

		if(netid === req.netid) {
			return res.status(400).send("Cannot friend yourself");
		}

		try {
			const existing = await FriendshipModel.findOne({
				where: {
					[Op.or]: [
						{ requester_netid: req.netid, requested_netid: netid },
						{ requester_netid: netid, requested_netid: req.netid },
					],
				},
			});

			if(existing) {
				return res.status(400).send("Friendship already exists or pending");
			}

			await FriendshipModel.create({
				requester_netid: req.netid,
				requested_netid: netid,
				status: "pending",
			});

			const status = await FriendshipModel.getStatus(req.netid, netid);
			const count = await FriendshipModel.getFriendCount(netid);
			return res.status(200).json({ status, count });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error sending friend request");
		}
	};

	acceptRequest = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			const request = await FriendshipModel.findOne({
				where: {
					requester_netid: netid,
					requested_netid: req.netid,
					status: "pending",
				},
			});

			if(!request) {
				return res.status(404).send("No pending request found");
			}

			request.status = "accepted";
			await request.save();

			const status = await FriendshipModel.getStatus(req.netid, netid);
			const count = await FriendshipModel.getFriendCount(netid);
			return res.status(200).json({ status, count });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error accepting friend request");
		}
	};

	declineRequest = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			const deleted = await FriendshipModel.destroy({
				where: {
					requester_netid: netid,
					requested_netid: req.netid,
					status: "pending",
				},
			});

			if(deleted === 0) {
				return res.status(404).send("No pending request found");
			}

			return res.status(200).json({ status: "none", count: await FriendshipModel.getFriendCount(netid) });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error declining friend request");
		}
	};

	removeFriend = async (req: Request, res: Response) => {
		const { netid } = req.params;

		try {
			await FriendshipModel.destroy({
				where: {
					[Op.or]: [
						{ requester_netid: req.netid, requested_netid: netid },
						{ requester_netid: netid, requested_netid: req.netid },
					],
					status: "accepted",
				},
			});

			return res.status(200).json({ status: "none", count: await FriendshipModel.getFriendCount(netid) });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error removing friend");
		}
	};
}
