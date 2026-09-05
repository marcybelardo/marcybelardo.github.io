// pattern: Functional Core

type PublishableEntry = {
  readonly id: string;
  readonly data: {
    readonly draft?: boolean;
  };
};

type DatedEntry = {
  readonly id: string;
  readonly data: {
    readonly date: Date;
  };
};

type BlogEntry = PublishableEntry &
  DatedEntry & {
    readonly data: {
      readonly tags?: ReadonlyArray<string>;
    };
  };

export type BlogTag = {
  readonly label: string;
  readonly slug: string;
};

export type BlogTagArchive<T extends BlogEntry> = BlogTag & {
  readonly posts: Array<T>;
};

type ResolveRelatedEntriesOptions<T extends PublishableEntry> = {
  readonly ids: ReadonlyArray<string>;
  readonly entries: ReadonlyArray<T>;
  readonly excludedId?: string;
};

type FeaturedProject = {
  readonly id: string;
  readonly data: {
    readonly date: Date;
    readonly draft?: boolean;
    readonly featured?: boolean;
    readonly featuredOrder?: number;
  };
};

export function filterPublishedEntries<T extends PublishableEntry>(
  entries: ReadonlyArray<T>,
  isProduction: boolean,
): Array<T> {
  if (!isProduction) {
    return [...entries];
  }

  return entries.filter((entry) => entry.data.draft !== true);
}

export function sortByDateDescending<T extends DatedEntry>(
  entries: ReadonlyArray<T>,
): Array<T> {
  return [...entries].sort((left, right) => {
    const dateDifference = right.data.date.getTime() - left.data.date.getTime();

    return dateDifference === 0 ? compareIds(left.id, right.id) : dateDifference;
  });
}

export function toTagSlug(tag: string): string | null {
  const normalizedTag = tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalizedTag.length > 0 ? normalizedTag : null;
}

export function getPublishedBlogPosts<T extends BlogEntry>(
  entries: ReadonlyArray<T>,
  isProduction: boolean,
): Array<T> {
  entries.forEach((post) => {
    post.data.tags?.forEach((tag) => {
      assertValidTagSlug(tag);
    });
  });

  return sortByDateDescending(filterPublishedEntries(entries, isProduction));
}

export function getBlogTagArchives<T extends BlogEntry>(
  entries: ReadonlyArray<T>,
  isProduction: boolean,
): Array<BlogTagArchive<T>> {
  const archivesBySlug = new Map<
    string,
    {
      readonly label: string;
      readonly slug: string;
      readonly posts: Array<T>;
      readonly postIds: Set<string>;
    }
  >();

  getPublishedBlogPosts(entries, isProduction).forEach((post) => {
    post.data.tags?.forEach((label) => {
      const slug = assertValidTagSlug(label);
      const existingArchive = archivesBySlug.get(slug);

      if (existingArchive) {
        if (!existingArchive.postIds.has(post.id)) {
          existingArchive.posts.push(post);
          existingArchive.postIds.add(post.id);
        }
        return;
      }

      archivesBySlug.set(slug, {
        label,
        slug,
        posts: [post],
        postIds: new Set([post.id]),
      });
    });
  });

  return [...archivesBySlug.values()].map(({ label, slug, posts }) => ({
    label,
    slug,
    posts,
  }));
}

export function resolveRelatedEntries<T extends PublishableEntry>(
  options: ResolveRelatedEntriesOptions<T>,
): Array<T> {
  const publishedEntries = filterPublishedEntries(options.entries, true);
  const entriesById = new Map(publishedEntries.map((entry) => [entry.id, entry]));
  const resolved: Array<T> = [];
  const seenIds = new Set<string>();

  options.ids.forEach((id) => {
    if (!id.trim() || id === options.excludedId || seenIds.has(id)) {
      return;
    }

    const entry = entriesById.get(id);

    if (entry) {
      resolved.push(entry);
      seenIds.add(id);
    }
  });

  return resolved;
}

function sortFeaturedProjects<T extends FeaturedProject>(
  entries: ReadonlyArray<T>,
): Array<T> {
  return [...entries].sort((left, right) => {
    const orderDifference = getFeaturedOrder(left) - getFeaturedOrder(right);

    if (orderDifference !== 0) {
      return orderDifference;
    }

    const dateDifference = right.data.date.getTime() - left.data.date.getTime();

    return dateDifference === 0 ? compareIds(left.id, right.id) : dateDifference;
  });
}

export function assertUniqueFeaturedOrders<T extends FeaturedProject>(
  entries: ReadonlyArray<T>,
): void {
  const orderOwners = new Map<number, string>();

  entries.forEach((entry) => {
    if (entry.data.featured !== true || entry.data.featuredOrder === undefined) {
      return;
    }

    const previousOwner = orderOwners.get(entry.data.featuredOrder);

    if (previousOwner !== undefined) {
      throw new Error(
        `featuredOrder must be unique for featured projects: ${entry.data.featuredOrder} is used by ${previousOwner} and ${entry.id}`,
      );
    }

    orderOwners.set(entry.data.featuredOrder, entry.id);
  });
}

export function getFeaturedProjects<T extends FeaturedProject>(
  entries: ReadonlyArray<T>,
  isProduction: boolean,
  limit = 4,
): Array<T> {
  assertValidLimit(limit, "featured project");
  assertUniqueFeaturedOrders(entries);
  const published = filterPublishedEntries(entries, isProduction);

  return sortFeaturedProjects(
    published.filter((entry) => entry.data.featured === true),
  ).slice(0, limit);
}

export function getRecentPosts<T extends PublishableEntry & DatedEntry>(
  entries: ReadonlyArray<T>,
  isProduction: boolean,
  limit = 3,
): Array<T> {
  const published = filterPublishedEntries(entries, isProduction);

  return limitRecentPosts(published, limit);
}

function limitRecentPosts<T extends DatedEntry>(
  entries: ReadonlyArray<T>,
  limit: number,
): Array<T> {
  assertValidLimit(limit, "recent post");

  return sortByDateDescending(entries).slice(0, limit);
}

function assertValidLimit(limit: number, label: string): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(`${label} limit must be a non-negative integer`);
  }
}

function assertValidTagSlug(tag: string): string {
  const slug = toTagSlug(tag);

  if (slug === null) {
    throw new Error(`blog tag must normalize to a non-empty slug: ${tag}`);
  }

  return slug;
}

function getFeaturedOrder(entry: FeaturedProject): number {
  return entry.data.featuredOrder ?? Number.MAX_SAFE_INTEGER;
}

function compareIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
