/**
 * The small part of the Standard.site model used by the publisher.
 *
 * The network adapter imports the generated atcute types at its boundary. The
 * core intentionally keeps these structural types so conversion and planning
 * can be tested without a PDS, OAuth, or an atcute installation.
 */

import {
  DOCUMENT_COLLECTION,
  PUBLICATION_COLLECTION,
} from "../../src/standard-site/identity.ts";

export { DOCUMENT_COLLECTION, PUBLICATION_COLLECTION } from "../../src/standard-site/identity.ts";

export interface PublicationRecord {
  readonly $type: typeof PUBLICATION_COLLECTION;
  readonly url: string;
  readonly name: string;
  readonly description?: string;
}

export interface DocumentRecord {
  readonly $type: typeof DOCUMENT_COLLECTION;
  readonly site: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly path: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly textContent?: string;
}

export type StandardRecord = PublicationRecord | DocumentRecord;

export interface PlannedRecord<T extends StandardRecord = StandardRecord> {
  readonly collection: typeof PUBLICATION_COLLECTION | typeof DOCUMENT_COLLECTION;
  readonly rkey: string;
  readonly uri: string;
  readonly value: T;
}

export interface RemoteRecord<T extends StandardRecord = StandardRecord> {
  readonly uri: string;
  readonly cid: string;
  readonly value: T;
}

export interface PutRecordInput {
  readonly repo: string;
  readonly collection: PlannedRecord["collection"];
  readonly rkey: string;
  readonly record: StandardRecord;
  /** The remote CID seen during planning, or null to require a create. */
  readonly swapRecord: string | null;
}

export interface PutRecordResult {
  readonly uri: string;
  readonly cid: string;
}

/** Injectable PDS boundary used by the planner and publisher. */
export interface PublisherPds {
  getRecord(collection: PlannedRecord["collection"], rkey: string): Promise<RemoteRecord | null>;
  putRecord(input: PutRecordInput): Promise<PutRecordResult>;
}

export type PlannedAction = "create" | "update" | "unchanged";

export interface RecordPlan {
  readonly planned: PlannedRecord;
  readonly remote: RemoteRecord | null;
  readonly action: PlannedAction;
  readonly changes: readonly string[];
}

export interface PublicationPlan {
  readonly did: string;
  readonly publication: RecordPlan;
  readonly documents: readonly RecordPlan[];
}

export interface SourcePost {
  readonly sourcePath: string;
  readonly slug: string;
  readonly title: string;
  readonly date: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly draft: boolean;
  readonly textContent: string;
}

export interface PreparedRecords {
  readonly posts: readonly SourcePost[];
  readonly excludedDrafts: readonly string[];
  readonly publicationUri: string;
  readonly publication: PublicationRecord;
  readonly documents: readonly PlannedRecord<DocumentRecord>[];
}

export class PublisherError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PublisherError";
  }
}

export type PdsOperation = "getRecord" | "putRecord";

/** A structured rejection returned by an authenticated PDS request. */
export class PdsError extends PublisherError {
  readonly operation: PdsOperation;
  readonly code: string;
  readonly status: number;

  constructor(
    operation: PdsOperation,
    code: string,
    status: number,
    message: string | undefined,
    options?: ErrorOptions,
  ) {
    super(
      `PDS ${operation} failed (${status} ${code})${message ? `: ${message}` : ""}`,
      options,
    );
    this.name = "PdsError";
    this.operation = operation;
    this.code = code;
    this.status = status;
  }
}
