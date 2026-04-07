import { Client } from "@elastic/elasticsearch";
import { PersonElasticsearchResult } from "./types";

export type SuggestionResult = {
	netid: string;
	first_name: string;
	last_name: string;
	image?: string;
	college?: string;
	year?: number;
	school?: string;
};

export default class Elasticsearch {
	#esClient: Client;

	constructor() {
		this.initializeElasticsearch();
	}

	initializeElasticsearch = () => {

		this.#esClient = new Client({
			node: process.env.ELASTICSEARCH_URL,
		});
	};

	suggestPerson = async (query: string, limit: number = 8): Promise<SuggestionResult[]> => {
		if (!query || query.trim().length === 0) return [];

		const queryWords = query.trim().split(/\s+/);

		const body = {
			size: limit,
			_source: ["netid", "first_name", "last_name", "preferred_name", "image", "college", "year", "school"],
			query: {
				bool: {
					should: [

						{
							multi_match: {
								query,
								type: "phrase_prefix" as const,
								fields: ["first_name^3", "last_name^3", "preferred_name^2"],
								boost: 10,
							},
						},

						{
							multi_match: {
								query,
								type: "cross_fields" as const,
								operator: "and" as const,
								fields: ["first_name^2", "last_name^2", "preferred_name"],
								boost: 5,
							},
						},

						...queryWords.map((word) => ({
							multi_match: {
								query: word,
								fields: ["first_name", "last_name", "preferred_name"],
								fuzziness: "AUTO" as const,
								boost: 1,
							},
						})),
					],
					minimum_should_match: 1,
				},
			},
		};

		try {
			const res = await this.#esClient.search({ index: "person", body });
			return res.body.hits.hits.map((hit: PersonElasticsearchResult) => ({
				netid: hit._source.netid,
				first_name: hit._source.first_name,
				last_name: hit._source.last_name,
				image: hit._source.image,
				college: hit._source.college,
				year: hit._source.year,
				school: hit._source.school,
			}));
		} catch (e) {
			console.error("Error fetching suggestions:", e);
			return [];
		}
	};

	searchPersonByNameFuzzy = async (query: string, isFuzzy: boolean): Promise<string[]> => {
		const queryWords = query.split(/\s+/);

		const searchFields = ["first_name^3", "last_name^3", "preferred_name^2", "email", "college", "major", "organization"];

		const body = isFuzzy ? {
			query: {
				bool: {
					should: [
						{
							multi_match: {
								query,
								operator: "or" as const,
								fields: ["first_name", "last_name", "preferred_name"],
								fuzziness: "AUTO" as const,
							},
						},
						{
							multi_match: {
								query,
								type: "phrase_prefix" as const,
								fields: ["first_name", "last_name", "preferred_name"],
							},
						},
						...queryWords.map((word) => ({
							multi_match: {
								query: word,
								operator: "or" as const,
								fields: ["first_name", "last_name", "preferred_name"],
								fuzziness: "AUTO" as const,
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
					type: "cross_fields" as const,
					operator: "and" as const,
					fields: searchFields,
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

		const ids = res.body.hits.hits.map((hit: PersonElasticsearchResult) => hit._source.netid);
		return ids;
	};
};
