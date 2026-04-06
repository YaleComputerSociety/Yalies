// API version prefixes — change these when bumping API versions
export const API_PREFIX = "/v3";
export const PIPELINE_PREFIX = "/api";
// Backend API (yalies-backend) endpoints
export const API = {
    ping: `${API_PREFIX}/ping`,
    login: `${API_PREFIX}/login`,
    logout: `${API_PREFIX}/login/logout`,
    people: `${API_PREFIX}/people`,
    peopleSuggest: `${API_PREFIX}/people/suggest`,
    filters: `${API_PREFIX}/filters`,
    globe: `${API_PREFIX}/globe`,
    profileMe: `${API_PREFIX}/profile/me`,
    profileMeFull: `${API_PREFIX}/profile/me/full`,
    profileMePhoto: `${API_PREFIX}/profile/me/photo`,
    profileMePhotoDownload: `${API_PREFIX}/profile/me/photo/download`,
    profile: (netid) => `${API_PREFIX}/profile/${netid}`,
    likesFor: (netid) => `${API_PREFIX}/likes/${netid}`,
    friendsMe: `${API_PREFIX}/friends/me`,
    friendsRequests: `${API_PREFIX}/friends/requests`,
    friendsStatus: (netid) => `${API_PREFIX}/friends/status/${netid}`,
    friendsCount: (netid) => `${API_PREFIX}/friends/count/${netid}`,
    friendsRequest: (netid) => `${API_PREFIX}/friends/request/${netid}`,
    friendsAccept: (netid) => `${API_PREFIX}/friends/accept/${netid}`,
    friendsDecline: (netid) => `${API_PREFIX}/friends/decline/${netid}`,
    friendsRemove: (netid) => `${API_PREFIX}/friends/${netid}`,
    community: `${API_PREFIX}/community`,
    communitySearch: `${API_PREFIX}/community/search`,
    communityMine: `${API_PREFIX}/community/mine`,
    communityPost: (id) => `${API_PREFIX}/community/${id}`,
    communityInterest: (id) => `${API_PREFIX}/community/${id}/interest`,
    apiKeysList: `${API_PREFIX}/api-keys/list`,
    apiKeysCreate: `${API_PREFIX}/api-keys/create`,
    apiKeysRevoke: `${API_PREFIX}/api-keys/revoke`,
    adminFacecheck: `${API_PREFIX}/admin/facecheck`,
};
// Router mount base paths (used by Express app.use() in the backend)
export const API_ROUTES = {
    ping: `${API_PREFIX}/ping`,
    people: `${API_PREFIX}/people`,
    login: `${API_PREFIX}/login`,
    filters: `${API_PREFIX}/filters`,
    apiKeys: `${API_PREFIX}/api-keys`,
    profile: `${API_PREFIX}/profile`,
    likes: `${API_PREFIX}/likes`,
    friends: `${API_PREFIX}/friends`,
    globe: `${API_PREFIX}/globe`,
    community: `${API_PREFIX}/community`,
    admin: `${API_PREFIX}/admin`,
};
// Data pipeline (yalies-data-pipeline) endpoints
export const PIPELINE_API = {
    auth: `${PIPELINE_PREFIX}/auth`,
    authMe: `${PIPELINE_PREFIX}/auth/me`,
    authLogout: `${PIPELINE_PREFIX}/auth/logout`,
    cookieValidate: `${PIPELINE_PREFIX}/cookie/validate`,
    scrapeFacebook: `${PIPELINE_PREFIX}/scrape/facebook`,
    scrapeDirectory: `${PIPELINE_PREFIX}/scrape/directory`,
    syncPreview: `${PIPELINE_PREFIX}/sync/preview`,
    sync: `${PIPELINE_PREFIX}/sync`,
    databaseOverview: `${PIPELINE_PREFIX}/database/overview`,
    databaseStudents: `${PIPELINE_PREFIX}/database/students`,
    databaseStudent: (id) => `${PIPELINE_PREFIX}/database/students/${id}`,
    databaseStudentPhoto: (id) => `${PIPELINE_PREFIX}/database/students/${id}/photo`,
    databaseStudentPhotoDownload: (id) => `${PIPELINE_PREFIX}/database/students/${id}/photo/download`,
    databaseComputeLocations: `${PIPELINE_PREFIX}/database/compute-locations`,
};
// Router mount base paths (used by Express app.use() in the pipeline server)
export const PIPELINE_ROUTES = {
    auth: `${PIPELINE_PREFIX}/auth`,
    cookie: `${PIPELINE_PREFIX}/cookie`,
    scrape: `${PIPELINE_PREFIX}/scrape`,
    sync: `${PIPELINE_PREFIX}/sync`,
    database: `${PIPELINE_PREFIX}/database`,
};
//# sourceMappingURL=apiEndpoints.js.map