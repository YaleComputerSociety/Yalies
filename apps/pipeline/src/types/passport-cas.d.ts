declare module "passport-cas" {
	import { Strategy as PassportStrategy } from "passport";

	interface StrategyOptions {
		version?: string;
		ssoBaseURL: string;
		serverBaseURL?: string;
		validateURL?: string;
		serviceURL?: string;
		useSaml?: boolean;
		passReqToCallback?: boolean;
	}

	interface Profile {
		user: string;
		attributes?: Record<string, string>;
	}

	type VerifyCallback = (err: Error | null, user?: object | false) => void;
	type VerifyFunction = (profile: Profile, done: VerifyCallback) => void;

	class Strategy extends PassportStrategy {
		constructor(options: StrategyOptions, verify: VerifyFunction);
		name: string;
	}

	export { Strategy };
}
