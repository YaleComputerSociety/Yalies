# Yalies
✨ The Yale Search Engine

## What is this repo?
Code in this repo is not in production yet. This is a repository for the rewrite of Yalies in NextJS/NodeJS.

If you are a Yale student, please view [the RFC](https://docs.google.com/document/d/1r285wAVGrB8fHPuPhyfj-cS82dlf8eJQpG0bjwicp0o/edit?usp=sharing) outlining the rewrite.

## Getting Started

### Project Structure
This project contains four directories:
- `yalies-web`
- `yalies-backend`
- `yalies-scraper`
- `yalies-shared`

### Windows Developers
If you're on Windows, everything's easier if you install Windows Subsystem for Linux (WSL). You can follow the instructions [here](https://docs.microsoft.com/en-us/windows/wsl/install).

Please install WSL. Going forwards, assume you will type all commands into your WSL CLI, and not your Windows Powershell.

### Node Version Manager

If you're a new NodeJS developer, you'll quickly find that you have to juggle between many different NodeJS/NPM versions on your machine. To make this easier, we use Node Version Manager (NVM).

To install NVM, run the pertinent command from [their repo](https://github.com/nvm-sh/nvm).

Now, for example you can type `nvm install 16` to install Node version 16. Then, you type `nvm use 16` to automatically switch your current Node version to 16.

If you ever encounter an `.nvmrc` file in a project, it's telling you which Node version to use! To automatically detect the `.nvmrc` and switch to that Node version, type `nvm use` inside the project directory.

### NPM

Node comes with a package manager called NPM. NPM allows us to pull libraries from the Internet, so we don't have to bundle them with the project.

The `package.json` file is a manifest of all libraries used in the project. To automatically download and install them, type `npm install` in the project directory.

### Environment Variables

Sometimes, we need configuration settings that are different for each developer/deployment environment. Or, we need secret keys that should be included in the code, but not committed to the repository. We need `.env` files for this.

In each directory, a `.env.template` file is provided.

The file that will be used for development is `.env.development`.

Production environment variables are a bit different:
- For frontend, the `.env.production` file is used.
- For backend, specify them in the Google Cloud console ([docs](https://cloud.google.com/run/docs/configuring/services/environment-variables#setting))
	- Note that `$PORT` is automatically specified and should not be specified in the console

### Cloud SQL Auth Proxy

Google Cloud SQL has additional protections so that only authorized users can access the database. To connect to the database, you need to run the Cloud SQL Auth Proxy.

First, ask your team lead to provide you with a Service Account key. This will let you connect to the database from a privileged environment. Put this key somewhere you won't delete!

Download the binary by [running this command](https://cloud.google.com/sql/docs/mysql/sql-proxy#mac-m1)

Move the binary to a directory in your `$PATH` so you can run the command.

Then, run:

```bash
cloud-sql-proxy --port 1357 --credentials-file=/path/to/service-key.json  yalies:us-central1:yalies-sql-prod
```

### Run the backend

Create a new terminal and `cd yalies-backend`.

`nvm use` to switch to the right version of Node.

`npm install` to install dependencies.

Run `cp .env.template .env.development`. Fill in the values, which should have been provided to you by your team lead.

`npm run dev` to start the development server.

For more info, see `yalies-backend/README.md`.

### Running the frontend

Create a new terminal, separate from your backend terminal, and `cd yalies-web`.

`nvm use` to switch to the right version of Node.

`npm install` to install dependencies.

Run `cp .env.template .env.development`. Fill in the values, which should have been provided to you by your team lead.

`npm run dev` to start the development server.

## Tech Stack
In an effort to keep this project maintainable by future Y/CS members and team leads, here is an explanation of the entire tech stack used by Yalies.

- Frontend
	- [Next.js](https://nextjs.org/): React framework with support for server-side rendering
		- This app uses the new NextJS App Router, as opposed to the old Page Router.
		- Read about server-side rendering and [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
	- Sass's [SCSS syntax](https://sass-lang.com/documentation/) for cleaner stylesheets
	- ESLint to enforce style
- Backend
	- NodeJS Express
		- We decided to use classes and OOP principles to structure the backend. Please follow existing code patterns.
	- Express-Session, Passport, and Passport-CAS for authentication
	- Sequelize as a SQL variant-agnostic ORM
	- Elasticsearch, [exactly v7.13.0](https://stackoverflow.com/questions/68892291/node-and-elasticsearch-client-the-client-noticed-that-the-server-is-not-a-supp)
	- ESLint to enforce style
- Shared
	- Types and helper functions to be shared between backend and frontend

## Deployment
With the rewrite, Yalies transitioned from a Heroku+AWS tech stack to Google Cloud.

- SQL host: Google Cloud SQL
	- Cloud SQL
	- PostgreSQL
	- Extensions: `pg_trgm`
- Backend host: Google Cloud Run
	- Cloud Run auto-scales, so we don't pay anything when there's no traffic and the site stays up when there's lots of traffic
- Frontend host: Firebase Hosting (with [experimental Next.js deployment](https://firebase.google.com/docs/hosting/frameworks/nextjs))
- Search host: Searchly
	- Searchly was the cheapest Elasticsearch host we could find
- Scraper host: Google Compute Engine
	- We can turn on and off the Compute Engine instance to save money when the scraper's not running

There are some additional services you may see enabled in the Cloud Console, but these are only used for one-off tasks
- Google Cloud Storage: upload Postgres dumps to import into Cloud SQL
- Cloud SQL Admin API: used for Cloud SQL Auth Proxy
- Yalies Developer Service Account (Under IAM & Admin): Used for the gcloud CLI tool
	- If you need your key to be added to this service account, ask your team lead
- Domain mapping to Cloud Run
	- See [this guide](https://cloud.google.com/run/docs/mapping-custom-domains)
	- This is marked as experimental, but for a project like this it's probably ok

### How to deploy
1. In `yalies-backend`, run `npm run deploy`.
2. In `yalies-web`, run `npm run deploy`.

## Maintenance
- To get a SQL command line, run the following while the Cloud SQL Auth Proxy is running:

```bash
psql -p 1357 "host=127.0.0.1 sslmode=disable dbname=postgres user=postgres"
```

## Shared Directory
- Note that the build scripts copy the shared directory into the backend and frontend directories.
- This is necessary because of the way Google Cloud Run deploys... don't ask

## Author

Yalies v1 was built by [Erik Boesen](https://github.com/ErikBoesen). Yalies v2 was built and is actively maintained by the [Yale Computer Society](https://yalecomputersociety.org/).
