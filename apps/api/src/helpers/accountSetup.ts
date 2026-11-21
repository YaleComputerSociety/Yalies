import { ACCOUNT_SETUP_MIN_POINTS, accountSetupPoints, type AccountSetup } from "yalies-shared";
import UserProfileModel from "./models/UserProfileModel.js";
import DiscoveryProfileModel from "./models/DiscoveryProfileModel.js";
import { getYaleMojiAvatar } from "./yalemojiAvatar.js";

export async function getAccountSetup(netid: string): Promise<AccountSetup | null> {
	const [profile, discovery, avatar] = await Promise.all([
		UserProfileModel.findByPk(netid), DiscoveryProfileModel.findByPk(netid), getYaleMojiAvatar(netid),
	]);
	const discoveryProfile = discovery?.toPrivateObject() ?? {};
	const avatarSet = !!avatar;
	const avatarPublic = profile?.show_yalemoji !== false;
	if(avatar === undefined && process.env.YALEMOJI_API_KEY && accountSetupPoints(false, avatarPublic, discoveryProfile) < ACCOUNT_SETUP_MIN_POINTS) return null;
	return { points: accountSetupPoints(avatarSet, avatarPublic, discoveryProfile),
		yalemoji_set: avatarSet, yalemoji_public: avatarPublic, discovery_profile: discoveryProfile };
}
