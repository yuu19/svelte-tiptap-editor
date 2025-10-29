import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { entries } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const list = await db
		.select()
		.from(entries)
		.orderBy(desc(entries.updatedAt));

	return {
		entries: list
	};
};
