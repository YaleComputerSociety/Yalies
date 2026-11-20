
export const API_PREFIX = "/v3";
export const PIPELINE_PREFIX = "/api";

export const API = {
	ping: `${API_PREFIX}/ping`,
	login: `${API_PREFIX}/login`,
	logout: `${API_PREFIX}/login/logout`,

	people: `${API_PREFIX}/people`,
	peopleSuggest: `${API_PREFIX}/people/suggest`,

	filters: `${API_PREFIX}/filters`,

	profileMe: `${API_PREFIX}/profile/me`,
	profileMeFull: `${API_PREFIX}/profile/me/full`,
	profileMeYaleMoji: `${API_PREFIX}/profile/me/yalemoji`,
	profileMePhoto: `${API_PREFIX}/profile/me/photo`,
	profileMePhotoDownload: `${API_PREFIX}/profile/me/photo/download`,
	profileMeChangeRequest: `${API_PREFIX}/profile/me/change-request`,
	profile: (netid: string) => `${API_PREFIX}/profile/${netid}`,

	likesFor: (netid: string) => `${API_PREFIX}/likes/${netid}`,

	savedMe: `${API_PREFIX}/saved/me`,
	savedFor: (netid: string) => `${API_PREFIX}/saved/${netid}`,
	savedLists: `${API_PREFIX}/saved-lists`,
	savedList: (id: number) => `${API_PREFIX}/saved-lists/${id}`,
	savedListDuplicate: (id: number) => `${API_PREFIX}/saved-lists/${id}/duplicate`,
	savedListImport: (id: number) => `${API_PREFIX}/saved-lists/${id}/import`,
	savedListMember: (id: number, netid: string) => `${API_PREFIX}/saved-lists/${id}/members/${netid}`,

	apiKeysList: `${API_PREFIX}/api-keys/list`,
	apiKeysCreate: `${API_PREFIX}/api-keys/create`,
	apiKeysRevoke: `${API_PREFIX}/api-keys/revoke`,

	adminFacecheck: `${API_PREFIX}/admin/facecheck`,
};

export const API_ROUTES = {
	ping: `${API_PREFIX}/ping`,
	people: `${API_PREFIX}/people`,
	login: `${API_PREFIX}/login`,
	filters: `${API_PREFIX}/filters`,
	apiKeys: `${API_PREFIX}/api-keys`,
	profile: `${API_PREFIX}/profile`,
	likes: `${API_PREFIX}/likes`,
	saved: `${API_PREFIX}/saved`,
	savedLists: `${API_PREFIX}/saved-lists`,
	admin: `${API_PREFIX}/admin`,
};

export const PIPELINE_API = {
	messages: `${PIPELINE_PREFIX}/messages`,
	auth: `${PIPELINE_PREFIX}/auth`,
	authMe: `${PIPELINE_PREFIX}/auth/me`,
	authLogout: `${PIPELINE_PREFIX}/auth/logout`,
	admins: `${PIPELINE_PREFIX}/admins`,
	admin: (netid: string) => `${PIPELINE_PREFIX}/admins/${encodeURIComponent(netid)}`,
	cookieValidate: `${PIPELINE_PREFIX}/cookie/validate`,
	scrapeFacebook: `${PIPELINE_PREFIX}/scrape/facebook`,
	scrapeDirectory: `${PIPELINE_PREFIX}/scrape/directory`,
	syncPreview: `${PIPELINE_PREFIX}/sync/preview`,
	sync: `${PIPELINE_PREFIX}/sync`,
	databaseOverview: `${PIPELINE_PREFIX}/database/overview`,
	databaseStudents: `${PIPELINE_PREFIX}/database/students`,
	databaseStudent: (id: number) => `${PIPELINE_PREFIX}/database/students/${id}`,
	databaseStudentPhoto: (id: number) => `${PIPELINE_PREFIX}/database/students/${id}/photo`,
	databaseStudentPhotoDownload: (id: number) => `${PIPELINE_PREFIX}/database/students/${id}/photo/download`,
	databaseComputeLocations: `${PIPELINE_PREFIX}/database/compute-locations`,
	databaseChangeRequests: `${PIPELINE_PREFIX}/database/change-requests`,
	databaseChangeRequest: (id: number) => `${PIPELINE_PREFIX}/database/change-requests/${id}`,
};

export const PIPELINE_ROUTES = {
	messages: `${PIPELINE_PREFIX}/messages`,
	auth: `${PIPELINE_PREFIX}/auth`,
	admins: `${PIPELINE_PREFIX}/admins`,
	cookie: `${PIPELINE_PREFIX}/cookie`,
	scrape: `${PIPELINE_PREFIX}/scrape`,
	sync: `${PIPELINE_PREFIX}/sync`,
	database: `${PIPELINE_PREFIX}/database`,
};
