import { Client } from "@elastic/elasticsearch";
import { PersonElasticsearchResult } from "./types";

export default class Elasticsearch {
	#esClient: Client;

	constructor() {
		this.initializeElasticsearch();
	}

	initializeElasticsearch = () => {
		this.#esClient = new Client({
			node: process.env.ELASTICSEARCH_URL,
			auth: {
				username: "F",
				password: "F",
			},
		});
	};

	searchPersonByNameFuzzy = async (query: string, isFuzzy: boolean): Promise<string[]> => {
		const queryWords = query.split(" ");

		const body = isFuzzy ? {
			query: {
				bool: {
					should: [
						{
							multi_match: {
								query,
								operator: "or",
								fields: ["first_name", "last_name"],
								fuzziness: "AUTO",
							},
						},
						{
							multi_match: {
								query,
								type: "phrase_prefix",
								fields: ["first_name", "last_name"],
							},
						},
						...queryWords.map((word) => ({
							multi_match: {
								query: word,
								operator: "or",
								fields: ["first_name", "last_name"],
								fuzziness: "AUTO",
							},
						})),
					],
					minimum_should_match: 1,
				},
			},
		} : {
			query: {
				multi_match: {
					query,
					type: "cross_fields",
					operator: "and",
					fields: ["*"],
				},
			},
		};
		let res;
		try {
			res = await this.#esClient.search({
				index: "person",
				body,
			});
		} catch(e) {
			console.error("Error searching for person:", e);
			return [];
		}
		// We are doing this by NetID because for some reason, Elasticsearch _id doesn't match up with SQL primary key...
		const ids = res.body.hits.hits.map((hit: PersonElasticsearchResult) => hit._source.netid);
		return ids;
	};
};
