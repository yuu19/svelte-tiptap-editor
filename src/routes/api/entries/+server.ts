import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { entries } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

type EntryPayload = {
	id?: string | null;
	title?: string | null;
	markdown?: string;
	html?: string;
};

export const POST = async ({ request }) => {
	const body = (await request.json()) as EntryPayload;
	const title = body.title?.trim() || 'Untitled';
	const markdown = body.markdown?.trim();
	const html = body.html?.trim();

	if (!markdown || !html) {
		throw error(400, 'markdown and html are required');
	}

	const now = new Date();

	if (body.id) {
		const [updated] = await db
			.update(entries)
			.set({ title, markdown, html, updatedAt: now })
			.where(eq(entries.id, body.id))
			.returning();

		if (!updated) {
			throw error(404, `Entry ${body.id} not found`);
		}

		return json({ entry: updated });
	}

	const [created] = await db
		.insert(entries)
		.values({ title, markdown, html, createdAt: now, updatedAt: now })
		.returning();

	return json({ entry: created }, { status: 201 });
};
