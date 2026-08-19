# Yalies Backend

## Breaking API changes from V1
- Base API URL changed to `https://api.yalies.io/v2/`
- HTTP (insecure) calls are no longer supported; any call to the API over HTTP will invalidate your key
- `/people` fields: `residence`, `building_code`, `entryway`, `floor`, `suite`, `room` removed because they are no longer exposed by the Yale Face Book
- `/people` field `birthday` removed because it is redundant and locale-specific
- `/people` option `page` is now zero-indexed; i.e. first page starts at `page: 0`
- `/people` page size now defaults to 100; page size must now be between 1 and 100 inclusive
- `/events` route removed


## SQL details
- We're using `sequelize` library to interact with the database
- Right now, we're using SQLite for development and Postgres for production.
	- SQLite is hosted on your local machine, in a file
	- Postgres is hosted on Heroku (which uses AWS behind the scenes)
	- We're planning on migrating our deployment stack to Google Cloud, which uses SQLite. Luckily, sequelize is sql-agnostic
- Each model is stored in `src/helpers/models`
	- Each model is defined as a TypeScript class
	- Models are registered with sequelize, which forms a connection between the class and a table in the database
	- Static methods on the model classes can be called to query/update

## CAS details
- **passport**: a library that integrates authentication in Express
- **passport-cas**: a custom strategy for passport. Passport supports google, twitter, etc authentication, but these people made a custom one that supports CAS
- **express-session**: a library that allows you to store session data in the database
- **connect-session-sequelize**: a library that allows you to store session data in the database
	- We are using Eric Yoon's fork of the library since there was a bug in the original. [See this PR](https://github.com/mweibel/connect-session-sequelize/pull/155)

### Authentication flow
1. User tries to go to a protected route
2. Express session checks if there's authentication information; it's not there. user gets an Unauthorized error
3. User goes to `/login`
4. User is redirected to CAS login
5. User logs in to CAS; is redirected back to the CAS callback page
6. Data is committed to express-session and saved to the database
7. User is redirected to `/`
8. User tries to go to the protected route again
9. Express session checks if there's authentication information; it's there. User is allowed to go to the protected route

### YaleMoji authentication

`GET /v3/login/yalemoji?state=<random-value>` authenticates through the existing Yale CAS strategy and redirects to the fixed YaleMoji callback with a signed, 60-second identity assertion.

Set `YALEMOJI_AUTH_CALLBACK_URL` and `YALEMOJI_AUTH_ERROR_CALLBACK_URL` to YaleMoji's fixed success and error callbacks. Error redirects include a stable `error` code and include `state` when it was valid. Set `YALEMOJI_AUTH_SECRET` to a strong shared secret, and configure that same secret in YaleMoji so it can verify the assertion. Never commit the secret.
