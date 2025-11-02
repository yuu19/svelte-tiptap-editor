import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { entries } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

type EntryPayload = {
	id?: string | null;
	title?: string | null;
	markdown?: string;
	html?: string;
	contentJson?: unknown;
	jsonVersion?: number;
};

export const POST = async ({ request }) => {
	const body = (await request.json()) as EntryPayload;
	const title = body.title?.trim() || 'Untitled';
	const markdown = body.markdown?.trim();
	const html = body.html?.trim();
	const jsonVersion =
		typeof body.jsonVersion === 'number' && Number.isInteger(body.jsonVersion) && body.jsonVersion > 0
			? body.jsonVersion
			: 1;
	const rawContentJson = body.contentJson;
	let contentJson: string | null = null;

	if (rawContentJson === undefined || rawContentJson === null) {
		throw error(400, 'contentJson is required');
	}

	try {
		contentJson =
			typeof rawContentJson === 'string'
				? rawContentJson.trim()
				: JSON.stringify(rawContentJson);
		if (!contentJson) {
			throw new Error('empty');
		}
		JSON.parse(contentJson);
	} catch {
		throw error(400, 'contentJson must be valid JSON');
	}

	if (!markdown || !html) {
		throw error(400, 'markdown and html are required');
	}

	const now = new Date();

	if (body.id) {
		const [updated] = await db
			.update(entries)
			.set({ title, markdown, html, contentJson, jsonVersion, updatedAt: now })
			.where(eq(entries.id, body.id))
			.returning();

		if (!updated) {
			throw error(404, `Entry ${body.id} not found`);
		}

		return json({ entry: updated });
	}

	const [created] = await db
		.insert(entries)
		.values({
			title,
			markdown,
			html,
			contentJson,
			jsonVersion,
			createdAt: now,
			updatedAt: now
		})
		.returning();

	return json({ entry: created }, { status: 201 });
};
