#!/bin/bash

# COPY V1 DB:
# Copies all data from V1 database to V2 database.

# PREREQUISITES
# cloud sql proxy should be running

# ENV VARS
# DATABASE_URL: V1 database url (the same one in bash profile)
# YALIES_V2_DATABASE_URL: the same string from .env.development DATABASE_URL
# PGPASSWORD: password for the V2 database


pg_dump \
	-Fp \
	--no-acl \
	--no-owner \
	-t group \
	-t leadership \
	-t person \
	"$DATABASE_URL" \
	> mydump.dump

psql -p 1357 "host=127.0.0.1 sslmode=disable dbname=postgres user=postgres" -c 'DROP TABLE IF EXISTS "group", "leadership", "person";'

psql -p 1357 "host=127.0.0.1 sslmode=disable dbname=postgres user=postgres" < mydump.dump

rm -f mydump.dump

echo "Finished cloning tables"
