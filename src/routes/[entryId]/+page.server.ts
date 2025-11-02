import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { entries } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
	const { entryId } = params;

	if (!entryId) {
		throw error(400, 'entryId is required');
	}

	const [entry] = await db.select().from(entries).where(eq(entries.id, entryId)).limit(1);

	if (!entry) {
		throw error(404, 'Entry not found');
	}

	return { entry };
};
