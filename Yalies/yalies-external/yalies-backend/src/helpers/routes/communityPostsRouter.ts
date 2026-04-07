import express, { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import CAS from "../cas.js";
import CommunityPostModel from "../models/CommunityPostModel.js";
import CommunityPostMemberModel from "../models/CommunityPostMemberModel.js";
import CommunityPostInterestModel from "../models/CommunityPostInterestModel.js";

export default class CommunityPostsRouter {
	getRouter = () => {
		const router = express.Router();
		router.post("/search", CAS.requireAuthentication, this.searchPosts);
		router.post("/", CAS.requireAuthentication, this.createPost);
		router.get("/mine", CAS.requireAuthentication, this.getMyPosts);
		router.get("/filters", CAS.requireAuthentication, this.getFilters);
		router.get("/:id", CAS.requireAuthentication, this.getPost);
		router.put("/:id", CAS.requireAuthentication, this.updatePost);
		router.delete("/:id", CAS.requireAuthentication, this.deletePost);
		router.post("/:id/interest", CAS.requireAuthentication, this.expressInterest);
		router.delete("/:id/interest", CAS.requireAuthentication, this.removeInterest);
		router.get("/:id/interests", CAS.requireAuthentication, this.getInterests);
		router.post("/:id/join", CAS.requireAuthentication, this.joinPost);
		router.delete("/:id/leave", CAS.requireAuthentication, this.leavePost);
		return router;
	};

	searchPosts = async (req: Request, res: Response) => {
		const { type, category, tags, status, page = 0, page_size = 20, query } = req.body;

		try {
			const where: Record<string, unknown> = {};
			if(type) where.type = type;
			if(category) where.category = category;
			if(status) {
				where.status = status;
			} else {
				where.status = { [Op.ne]: "archived" };
			}
			if(tags && tags.length > 0) {
				where.tags = { [Op.overlap]: tags };
			}
			if(query) {
				where[Op.or as unknown as string] = [
					{ title: { [Op.iLike]: `%${query}%` } },
					{ description: { [Op.iLike]: `%${query}%` } },
				];
			}

			const posts = await CommunityPostModel.findAll({
				where,
				order: [["created_at", "DESC"]],
				limit: page_size,
				offset: page * page_size,
			});

			const postIds = posts.map(p => p.id);

			const [members, interestCountRows, myInterests] = await Promise.all([
				CommunityPostMemberModel.findAll({ where: { post_id: { [Op.in]: postIds } } }),
				CommunityPostInterestModel.findAll({
					where: { post_id: { [Op.in]: postIds } },
					attributes: [
						"post_id",
						[CommunityPostModel.sequelize.fn("COUNT", CommunityPostModel.sequelize.col("*")), "count"],
					],
					group: ["post_id"],
					raw: true,
				}) as unknown as Promise<({ post_id: number; count: string })[]>,
				CommunityPostInterestModel.findAll({
					where: { post_id: { [Op.in]: postIds }, netid: req.netid },
				}),
			]);

			const interestCounts: Record<number, number> = {};
			for(const row of interestCountRows) {
				interestCounts[row.post_id] = parseInt(row.count, 10);
			}

			const myInterestSet = new Set(myInterests.map(i => i.post_id));

			const result = posts.map(post => {
				const postMembers = members
					.filter(m => m.post_id === post.id)
					.map(m => ({ netid: m.netid, role: m.role, joined_at: m.joined_at }));

				return {
					...post.toSanitizedObject(),
					members: postMembers,
					interest_count: interestCounts[post.id] || 0,
					is_interested: myInterestSet.has(post.id),
				};
			});

			return res.status(200).json(result);
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error searching posts");
		}
	};

	createPost = async (req: Request, res: Response) => {
		const { type, title, description, tags, category, competition_name, competition_date, competition_url, spots_total, members } = req.body;

		if(!type || !title || !category) {
			return res.status(400).send("type, title, and category are required");
		}

		try {
			const post = await CommunityPostModel.create({
				author_netid: req.netid,
				type,
				title,
				description: description || "",
				tags: tags || [],
				category,
				competition_name,
				competition_date,
				competition_url,
				spots_total,
				status: "open",
			});

			await CommunityPostMemberModel.create({
				post_id: post.id,
				netid: req.netid,
				role: "creator",
			});

			if(members && Array.isArray(members)) {
				const uniqueMembers = [...new Set(members as string[])].filter(n => n !== req.netid);
				for(const netid of uniqueMembers) {
					await CommunityPostMemberModel.create({
						post_id: post.id,
						netid,
						role: "member",
					});
				}
			}

			return res.status(201).json(post.toSanitizedObject());
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error creating post");
		}
	};

	getMyPosts = async (req: Request, res: Response) => {
		try {
			const posts = await CommunityPostModel.findAll({
				where: { author_netid: req.netid },
				order: [["created_at", "DESC"]],
			});

			const postIds = posts.map(p => p.id);
			const [members, interestCountRows] = await Promise.all([
				CommunityPostMemberModel.findAll({ where: { post_id: { [Op.in]: postIds } } }),
				CommunityPostInterestModel.findAll({
					where: { post_id: { [Op.in]: postIds } },
					attributes: [
						"post_id",
						[CommunityPostModel.sequelize.fn("COUNT", CommunityPostModel.sequelize.col("*")), "count"],
					],
					group: ["post_id"],
					raw: true,
				}) as unknown as Promise<({ post_id: number; count: string })[]>,
			]);
			const interestCounts: Record<number, number> = {};
			for(const row of interestCountRows) {
				interestCounts[row.post_id] = parseInt(row.count, 10);
			}

			const result = posts.map(post => {
				const postMembers = members
					.filter(m => m.post_id === post.id)
					.map(m => ({ netid: m.netid, role: m.role, joined_at: m.joined_at }));
				return {
					...post.toSanitizedObject(),
					members: postMembers,
					interest_count: interestCounts[post.id] || 0,
				};
			});

			return res.status(200).json(result);
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching your posts");
		}
	};

	getFilters = async (req: Request, res: Response) => {
		try {
			const [categories, tags] = await Promise.all([
				CommunityPostModel.findAll({
					attributes: ["category"],
					group: ["category"],
					raw: true,
				}),
				CommunityPostModel.sequelize.query(
					`SELECT DISTINCT unnest(tags) as tag FROM community_post WHERE status != 'archived' ORDER BY tag`,
					{ type: QueryTypes.SELECT },
				),
			]);

			return res.status(200).json({
				categories: categories.map((c: { category: string }) => c.category),
				tags: (tags as unknown as { tag: string }[]).map(t => t.tag),
				types: ["team", "recruiting", "showcase"],
			});
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching filters");
		}
	};

	getPost = async (req: Request, res: Response) => {
		const { id } = req.params;

		try {
			const post = await CommunityPostModel.findByPk(id);
			if(!post) return res.status(404).send("Post not found");

			const [members, interestCount, myInterest] = await Promise.all([
				CommunityPostMemberModel.findAll({ where: { post_id: post.id } }),
				CommunityPostInterestModel.count({ where: { post_id: post.id } }),
				CommunityPostInterestModel.findOne({ where: { post_id: post.id, netid: req.netid } }),
			]);

			return res.status(200).json({
				...post.toSanitizedObject(),
				members: members.map(m => ({ netid: m.netid, role: m.role, joined_at: m.joined_at })),
				interest_count: interestCount,
				is_interested: !!myInterest,
			});
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching post");
		}
	};

	updatePost = async (req: Request, res: Response) => {
		const { id } = req.params;
		const { title, description, tags, category, type, competition_name, competition_date, competition_url, spots_total, status } = req.body;

		try {
			const post = await CommunityPostModel.findByPk(id);
			if(!post) return res.status(404).send("Post not found");
			if(post.author_netid !== req.netid) return res.status(403).send("Not your post");

			await post.update({
				...title !== undefined && { title },
				...description !== undefined && { description },
				...tags !== undefined && { tags },
				...category !== undefined && { category },
				...type !== undefined && { type },
				...competition_name !== undefined && { competition_name },
				...competition_date !== undefined && { competition_date },
				...competition_url !== undefined && { competition_url },
				...spots_total !== undefined && { spots_total },
				...status !== undefined && { status },
				updated_at: new Date(),
			});

			return res.status(200).json(post.toSanitizedObject());
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error updating post");
		}
	};

	deletePost = async (req: Request, res: Response) => {
		const { id } = req.params;

		try {
			const post = await CommunityPostModel.findByPk(id);
			if(!post) return res.status(404).send("Post not found");
			if(post.author_netid !== req.netid) return res.status(403).send("Not your post");

			await post.destroy();
			return res.status(200).send("Post deleted");
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error deleting post");
		}
	};

	expressInterest = async (req: Request, res: Response) => {
		const { id } = req.params;
		const { message } = req.body;

		try {
			const post = await CommunityPostModel.findByPk(id);
			if(!post) return res.status(404).send("Post not found");

			await CommunityPostInterestModel.upsert({
				post_id: post.id,
				netid: req.netid,
				message: message || null,
			});

			const count = await CommunityPostInterestModel.count({ where: { post_id: post.id } });
			return res.status(200).json({ interested: true, count });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error expressing interest");
		}
	};

	removeInterest = async (req: Request, res: Response) => {
		const { id } = req.params;

		try {
			await CommunityPostInterestModel.destroy({
				where: { post_id: parseInt(id), netid: req.netid },
			});

			const count = await CommunityPostInterestModel.count({ where: { post_id: parseInt(id) } });
			return res.status(200).json({ interested: false, count });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error removing interest");
		}
	};

	getInterests = async (req: Request, res: Response) => {
		const { id } = req.params;

		try {
			const post = await CommunityPostModel.findByPk(id);
			if(!post) return res.status(404).send("Post not found");
			if(post.author_netid !== req.netid) return res.status(403).send("Only the author can view interested people");

			const interests = await CommunityPostInterestModel.findAll({
				where: { post_id: post.id },
				order: [["created_at", "DESC"]],
			});

			return res.status(200).json(interests.map(i => ({
				netid: i.netid,
				message: i.message,
				created_at: i.created_at,
			})));
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error fetching interests");
		}
	};

	joinPost = async (req: Request, res: Response) => {
		const { id } = req.params;

		try {
			const post = await CommunityPostModel.findByPk(id);
			if(!post) return res.status(404).send("Post not found");
			if(post.status !== "open") return res.status(400).send("Post is not open");

			const existingMember = await CommunityPostMemberModel.findOne({
				where: { post_id: post.id, netid: req.netid },
			});
			if(existingMember) return res.status(400).send("Already a member");

			if(post.spots_total) {
				const memberCount = await CommunityPostMemberModel.count({ where: { post_id: post.id } });
				if(memberCount >= post.spots_total) return res.status(400).send("Team is full");
			}

			await CommunityPostMemberModel.create({
				post_id: post.id,
				netid: req.netid,
				role: "member",
			});

			return res.status(200).json({ joined: true });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error joining post");
		}
	};

	leavePost = async (req: Request, res: Response) => {
		const { id } = req.params;

		try {
			const member = await CommunityPostMemberModel.findOne({
				where: { post_id: parseInt(id), netid: req.netid },
			});
			if(!member) return res.status(400).send("Not a member");
			if(member.role === "creator") return res.status(400).send("Creator cannot leave. Delete the post instead.");

			await member.destroy();
			return res.status(200).json({ joined: false });
		} catch(e) {
			console.error(e);
			return res.status(500).send("Error leaving post");
		}
	};
}
