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

export function sortFeaturedProjects<T extends FeaturedProject>(
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

export function getFeaturedProjects<T extends FeaturedProject>(
  entries: ReadonlyArray<T>,
  isProduction: boolean,
): Array<T> {
  const published = filterPublishedEntries(entries, isProduction);

  return sortFeaturedProjects(published.filter((entry) => entry.data.featured === true));
}

export function limitRecentPosts<T extends DatedEntry>(
  entries: ReadonlyArray<T>,
  limit: number,
): Array<T> {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("recent post limit must be a non-negative integer");
  }

  return sortByDateDescending(entries).slice(0, limit);
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
