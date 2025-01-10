CREATE TABLE IF NOT EXISTS Messages (
	id TEXT PRIMARY KEY,
	groupId TEXT,
	timeStamp INTEGER NOT NULL,
	userName TEXT,
	content TEXT,
	messageId INTEGER,
	groupName TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_groupid_timestamp
			ON Messages(groupId, timeStamp DESC);
