export const NOTIFICATION_COMPOSE_COLORS = ["green", "grey", "blue"] as const;

export const NOTIFICATION_SCHEMA_SQL = `
	CREATE TABLE IF NOT EXISTS notification (
		id BIGSERIAL PRIMARY KEY,
		"to" VARCHAR(255) NOT NULL,
		subject TEXT NOT NULL,
		message TEXT NOT NULL,
		timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		color VARCHAR(16) NOT NULL DEFAULT 'green' CHECK (color IN ('green', 'grey', 'blue', 'amber', 'red')),
		viewed_at TIMESTAMPTZ
	);
	DO $$ BEGIN
		IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'notification'::regclass
			AND conname = 'notification_color_check' AND pg_get_constraintdef(oid) NOT LIKE '%grey%') THEN
			ALTER TABLE notification DROP CONSTRAINT notification_color_check;
			ALTER TABLE notification ADD CONSTRAINT notification_color_check
				CHECK (color IN ('green', 'grey', 'blue', 'amber', 'red'));
		END IF;
	END $$;
	CREATE INDEX IF NOT EXISTS notification_unviewed_recipient
		ON notification ("to", timestamp DESC) WHERE viewed_at IS NULL;
`;

