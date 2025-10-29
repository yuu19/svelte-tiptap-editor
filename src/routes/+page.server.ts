import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { entries } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [entry] = await db
		.select()
		.from(entries)
		.orderBy(desc(entries.updatedAt))
		.limit(1);

	return {
		entry: entry ?? null
	};
};
