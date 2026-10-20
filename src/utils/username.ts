// Mirrors USERNAME_REGEX in worker.ts. The server also rejects reserved names;
// the client cannot know that list, so it remains the final authority.
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/;

export const isValidUsername = (username: string): boolean => USERNAME_PATTERN.test(username);
