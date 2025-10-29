import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { entries } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET = async ({ params }) => {
	const { id } = params;

	const [entry] = await db.select().from(entries).where(eq(entries.id, id));

	if (!entry) {
		throw error(404, `Entry ${id} not found`);
	}

	return json({ entry });
};
